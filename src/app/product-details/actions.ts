'use server'

import { createClient } from '@/utils/supabase/server';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';
import { buildMedusaAdminProductPayload, type ProductLikeForMedusaPayload } from '@/lib/medusa/build-admin-product-payload';
import { sanitizeMedusaProductPayload } from '@/lib/medusa/normalize-product-payload';
import { validateMedusaProductPayload } from '@/lib/medusa/validate-payload';
import { shouldUseTwoPhase, createProductTwoPhase } from '@/lib/medusa/two-phase-creation';
import { updateProductInMedusa } from '@/lib/medusa/update-product-strategy';
import { parseMedusaError, parseMedusaResponse } from '@/lib/medusa/error-handler';
import { extractProductId } from '@/lib/medusa/response-parser';
import { withRetry } from '@/lib/medusa/retry';

export type PushProductResult =
  | { success: true; productId: string | null }
  | { success: false; error: string; details?: unknown };

/**
 * Push a product to Medusa — create or update — from a server action.
 *
 * This keeps the Medusa payload building and push orchestration entirely
 * server-side. Components only pass raw product state and handle UI feedback.
 *
 * Security:
 * - Auth and org membership verified server-side.
 * - Medusa API key is decrypted server-side and never returned to the browser.
 */
export async function pushProductToMedusa(
  productData: ProductLikeForMedusaPayload,
  medusaProductId: string | null
): Promise<PushProductResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!membership?.organization_id) {
    return { success: false, error: 'No organization found' };
  }

  const settings = await loadDecryptedSettingsForServer(membership.organization_id);
  if (!settings || !settings.medusaUrl || !settings.medusaApiKey || settings.storePlatform !== 'medusa') {
    return { success: false, error: 'MedusaJS integration not configured' };
  }

  let baseUrl = settings.medusaUrl.trim().replace(/\/$/, '');
  if (baseUrl.endsWith('/admin')) baseUrl = baseUrl.replace(/\/admin$/, '');

  const apiKey = settings.medusaApiKey;
  const headers = {
    'x-medusa-access-token': apiKey,
    'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json',
  };

  const isUpdate = !!medusaProductId;
  const rawPayload = buildMedusaAdminProductPayload(productData, isUpdate);
  const sanitizedPayload = sanitizeMedusaProductPayload(rawPayload);

  try {
    validateMedusaProductPayload(sanitizedPayload);
  } catch (err) {
    return { success: false, error: 'Payload validation failed', details: err instanceof Error ? err.message : String(err) };
  }

  // UPDATE path
  if (isUpdate) {
    try {
      await updateProductInMedusa(medusaProductId, sanitizedPayload);
      return { success: true, productId: medusaProductId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update product in Medusa';
      return { success: false, error: message };
    }
  }

  // CREATE path
  const useTwoPhase = shouldUseTwoPhase(sanitizedPayload);

  if (useTwoPhase) {
    try {
      const response = await createProductTwoPhase(sanitizedPayload);
      const productId = extractProductId(response);
      return { success: true, productId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Two-phase creation failed';
      return { success: false, error: message };
    }
  }

  // Single-phase create
  try {
    const res = await withRetry(async () =>
      fetch(`${baseUrl}/admin/products`, {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify(sanitizedPayload),
      })
    );

    const text = await res.text();
    const response = parseMedusaResponse(text);

    if (!res.ok) {
      const error = parseMedusaError(res.status, res.statusText, response);
      return { success: false, error: error.message, details: response };
    }

    const productId = extractProductId(response);
    return { success: true, productId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to push product to Medusa';
    return { success: false, error: message };
  }
}

export async function getMedusaTaxonomy(orgId: string) {
  const settings = await loadDecryptedSettingsForServer(orgId);
  if (!settings || !settings.medusaUrl || !settings.medusaApiKey || settings.storePlatform !== 'medusa') {
    return {
      success: false,
      error: 'MedusaJS integration not configured'
    };
  }

  // Normalize URL: Remove trailing slash and any existing /admin prefix to avoid duplication
  let baseUrl = settings.medusaUrl.trim().replace(/\/$/, '');
  if (baseUrl.endsWith('/admin')) {
    baseUrl = baseUrl.replace(/\/admin$/, '');
  }

  const apiKey = settings.medusaApiKey;

  /**
   * Medusa V2 Authentication:
   * 1. JWT tokens use 'Bearer'
   * 2. Secret API Keys use 'Basic' (base64 encoded key:) or 'x-medusa-access-token'
   * We provide both for maximum compatibility across V1/V2 setups.
   */
  const headers = {
    'x-medusa-access-token': apiKey,
    'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json'
  };

  try {
    const endpoints = [
      'collections',
      'product-categories',
      'sales-channels',
      'product-types',
      'shipping-profiles',
      'stores',
      'stock-locations'
    ];

    const results = await Promise.all(
      endpoints.map(async (endpoint) => {
        const url = `${baseUrl}/admin/${endpoint}`;
        try {
          const res = await fetch(url, {
            headers,
            cache: 'no-store'
          });

          if (!res.ok) {
            console.error(`Medusa API Error [${endpoint}]:`, res.status, res.statusText);
            return null;
          }

          return res.json();
        } catch (e) {
          console.error(`Fetch failed for [${endpoint}]:`, e);
          return null;
        }
      })
    );

    const [collections, categories, channels, types, shippingProfiles, stores, stockLocations] = results;

    // Extract supported currencies from the first store (Medusa v2 usually has one primary store)
    type StoresResponse = {
      stores?: Array<{
        supported_currencies?: Array<{ currency: string }>;
      }>;
    };
    const storesData = stores as StoresResponse | null;
    const activeCurrencies = storesData?.stores?.[0]?.supported_currencies?.map((sc: any) => {
      // Handle various Medusa versions/structures
      return (sc.currency_code || sc.code || sc.currency || '').toString();
    }).filter(Boolean) || [];

    return {
      success: true,
      data: {
        collections: collections?.collections || [],
        categories: categories?.product_categories || [],
        sales_channels: channels?.sales_channels || [],
        product_types: types?.product_types || [],
        shipping_profiles: shippingProfiles?.shipping_profiles || [],
        currencies: activeCurrencies,
        stock_locations: stockLocations?.stock_locations || []
      }
    };
  } catch (err) {
    console.error('Failed to fetch Medusa taxonomy:', err);
    return {
      success: false,
      error: 'Failed to connect to MedusaJS server'
    };
  }
}

export async function getMedusaProducts(orgId: string) {
  const settings = await loadDecryptedSettingsForServer(orgId);
  if (!settings || !settings.medusaUrl || !settings.medusaApiKey || settings.storePlatform !== 'medusa') {
    return {
      success: false,
      error: 'MedusaJS integration not configured'
    };
  }

  let baseUrl = settings.medusaUrl.trim().replace(/\/$/, '');
  if (baseUrl.endsWith('/admin')) {
    baseUrl = baseUrl.replace(/\/admin$/, '');
  }

  const apiKey = settings.medusaApiKey;
  const headers = {
    'x-medusa-access-token': apiKey,
    'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json'
  };

  try {
    const res = await fetch(`${baseUrl}/admin/products?limit=20`, {
      headers,
      cache: 'no-store'
    });

    if (!res.ok) {
      console.error(`Medusa API Error [products]:`, res.status, res.statusText);
      return { success: false, error: `Medusa API error: ${res.status}` };
    }

    const data = await res.json();
    return {
      success: true,
      data: data.products || []
    };
  } catch (err) {
    console.error('Failed to fetch Medusa products:', err);
    return {
      success: false,
      error: 'Failed to connect to MedusaJS server'
    };
  }
}