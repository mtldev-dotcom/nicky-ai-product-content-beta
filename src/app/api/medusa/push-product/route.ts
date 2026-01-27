import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';
import { sanitizeMedusaProductPayload } from '@/lib/medusa/normalize-product-payload';
import { shouldUseTwoPhase, createProductTwoPhase } from '@/lib/medusa/two-phase-creation';
import { validateMedusaProductPayload } from '@/lib/medusa/validate-payload';
import { withRetry } from '@/lib/medusa/retry';
import { parseMedusaError, parseMedusaResponse } from '@/lib/medusa/error-handler';
import { extractProductId } from '@/lib/medusa/response-parser';

export const runtime = 'nodejs';

/**
 * Push a product payload to Medusa (create-only, first pass).
 *
 * Security:
 * - Auth required (Supabase session).
 * - Org derived from membership server-side.
 * - Medusa API key is decrypted server-side and never returned to the browser.
 */
const PushProductSchema = z.object({
  payload: z.unknown(), // Medusa Admin API product create payload
});

export async function POST(req: Request) {
  try {
    const { payload } = PushProductSchema.parse(await req.json());

    // Defensive: browsers can send richer currency objects; Medusa expects string codes.
    const sanitizedPayload = sanitizeMedusaProductPayload(payload);

    // Pre-flight validation: check for common issues that cause 400s
    if (typeof sanitizedPayload !== 'object' || sanitizedPayload === null || Array.isArray(sanitizedPayload)) {
      return NextResponse.json(
        { error: 'Invalid payload: must be an object', details: { received: typeof sanitizedPayload } },
        { status: 400 }
      );
    }

    const payloadObj = sanitizedPayload as Record<string, unknown>;
    
    // Validate variants exist and are non-empty
    const variants = payloadObj.variants;
    if (!Array.isArray(variants) || variants.length === 0) {
      return NextResponse.json(
        { error: 'Invalid payload: variants array is required and must not be empty', details: { variants } },
        { status: 400 }
      );
    }

    // Validate each variant has required fields
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (typeof variant !== 'object' || variant === null || Array.isArray(variant)) {
        return NextResponse.json(
          { error: `Invalid variant at index ${i}: must be an object`, details: { variantIndex: i, variant } },
          { status: 400 }
        );
      }
      
      const v = variant as Record<string, unknown>;
      
      // Ensure prices array exists and has at least one price
      const prices = v.prices;
      if (!Array.isArray(prices) || prices.length === 0) {
        return NextResponse.json(
          { error: `Invalid variant at index ${i}: must have at least one price`, details: { variantIndex: i, variant: v } },
          { status: 400 }
        );
      }
      
      // Validate each price has amount and currency_code
      for (let j = 0; j < prices.length; j++) {
        const price = prices[j];
        if (typeof price !== 'object' || price === null || Array.isArray(price)) {
          return NextResponse.json(
            { error: `Invalid price at variant[${i}].prices[${j}]: must be an object`, details: { variantIndex: i, priceIndex: j, price } },
            { status: 400 }
          );
        }
        
        const p = price as Record<string, unknown>;
        if (typeof p.amount !== 'number' || !Number.isFinite(p.amount)) {
          return NextResponse.json(
            { error: `Invalid price at variant[${i}].prices[${j}]: amount must be a number`, details: { variantIndex: i, priceIndex: j, price: p } },
            { status: 400 }
          );
        }
        
        if (typeof p.currency_code !== 'string' || p.currency_code.trim().length === 0) {
          return NextResponse.json(
            { error: `Invalid price at variant[${i}].prices[${j}]: currency_code must be a non-empty string`, details: { variantIndex: i, priceIndex: j, price: p } },
            { status: 400 }
          );
        }
      }
      
      // Ensure inventory field is NOT present (Medusa v2 doesn't accept it in create payload)
      if ('inventory' in v) {
        console.warn(`Warning: Variant at index ${i} contains 'inventory' field which will be omitted (Medusa v2 doesn't accept inventory in product create payload)`);
      }
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const settings = await loadDecryptedSettingsForServer(membership.organization_id);
    if (!settings || !settings.medusaUrl || !settings.medusaApiKey || settings.storePlatform !== 'medusa') {
      return NextResponse.json({ error: 'MedusaJS integration not configured' }, { status: 400 });
    }

    // Normalize URL: remove trailing slash and any existing /admin prefix to avoid duplication
    let baseUrl = settings.medusaUrl.trim().replace(/\/$/, '');
    if (baseUrl.endsWith('/admin')) {
      baseUrl = baseUrl.replace(/\/admin$/, '');
    }

    // Validate payload before sending
    try {
      validateMedusaProductPayload(sanitizedPayload);
    } catch (validationError) {
      return NextResponse.json(
        {
          error: 'Payload validation failed',
          details: validationError instanceof Error ? validationError.message : String(validationError),
        },
        { status: 400 }
      );
    }

    // Determine if we should use two-phase creation
    const useTwoPhase = shouldUseTwoPhase(sanitizedPayload);

    let response: unknown;
    let productId: string | null = null;

    if (useTwoPhase) {
      // Use two-phase creation: options first, then variants
      try {
        response = await createProductTwoPhase(sanitizedPayload);
        productId = extractProductId(response);
      } catch (error) {
        console.error('Two-phase creation failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Two-phase creation failed';
        
        // Check if error is about product already existing
        if (errorMessage.includes('already exists')) {
          return NextResponse.json(
            {
              error: errorMessage,
              details: {
                suggestion: 'A product with this handle already exists in Medusa. If you want to update it, use the update endpoint instead.',
                handle: payloadObj.handle,
              },
            },
            { status: 409 } // 409 Conflict is more appropriate for "already exists"
          );
        }
        
        return NextResponse.json(
          {
            error: `Failed to create product (two-phase): ${errorMessage}`,
            details: error instanceof Error && 'details' in error ? (error as { details?: unknown }).details : undefined,
          },
          { status: 502 }
        );
      }
    } else {
      // Use single-phase creation (original approach)
      const apiKey = settings.medusaApiKey;
      const headers = {
        'x-medusa-access-token': apiKey,
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      };

      try {
        const res = await withRetry(async () => {
          return fetch(`${baseUrl}/admin/products`, {
            method: 'POST',
            headers,
            cache: 'no-store',
            body: JSON.stringify(sanitizedPayload),
          });
        });

        const text = await res.text();
        response = parseMedusaResponse(text);

        if (!res.ok) {
          const error = parseMedusaError(res.status, res.statusText, response);
          
          // Log the full error for debugging
          console.error('Medusa API error:', {
            status: res.status,
            statusText: res.statusText,
            url: `${baseUrl}/admin/products`,
            response,
            payloadPreview: {
              title: payloadObj.title,
              handle: payloadObj.handle,
              variantsCount: Array.isArray(payloadObj.variants) ? payloadObj.variants.length : 0,
            },
          });

          return NextResponse.json(
            {
              error: error.message,
              details: response,
            },
            { status: 502 }
          );
        }

        productId = extractProductId(response);
      } catch (error) {
        console.error('Medusa API request failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create product';
        return NextResponse.json(
          {
            error: `Medusa API error: ${errorMessage}`,
            details: error instanceof Error && 'details' in error ? (error as { details?: unknown }).details : undefined,
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      productId: productId || null,
      data: response,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to push product to Medusa';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


