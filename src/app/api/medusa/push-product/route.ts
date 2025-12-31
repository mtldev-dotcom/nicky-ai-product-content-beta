import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';
import { sanitizeMedusaProductPayload } from '@/lib/medusa/normalize-product-payload';

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

    const apiKey = settings.medusaApiKey;
    const headers = {
      'x-medusa-access-token': apiKey,
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    };

    // NOTE: Kept for backward compatibility. New code should prefer `/api/medusa/products`.
    const res = await fetch(`${baseUrl}/admin/products`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify(sanitizedPayload),
    });

    const text = await res.text();
    const json = (() => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return { raw: text };
      }
    })();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Medusa API error: ${res.status} ${res.statusText}`,
          details: json,
        },
        { status: 502 }
      );
    }

    // Medusa typically returns `{ product: { id, ... } }`
    const productId =
      typeof json === 'object' && json !== null
        ? (json as { product?: { id?: string } }).product?.id
        : undefined;

    return NextResponse.json({
      success: true,
      productId: productId || null,
      data: json,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to push product to Medusa';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


