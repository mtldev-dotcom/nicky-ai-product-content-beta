/**
 * Centralized Medusa API client utility.
 *
 * Provides consistent authentication, URL normalization, and error handling
 * across all Medusa API operations.
 */

import { createClient } from '@/utils/supabase/server';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';

export type MedusaAuthResult =
  | { ok: true; baseUrl: string; headers: Record<string, string> }
  | { ok: false; status: number; error: string };

/**
 * Get Medusa authentication and configuration for the current user's organization.
 *
 * Returns:
 * - `baseUrl`: Normalized Medusa base URL (without /admin suffix)
 * - `headers`: Authentication headers for Medusa API requests
 */
export async function getMedusaAuth(): Promise<MedusaAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!membership?.organization_id) {
    return { ok: false, status: 403, error: 'No organization found' };
  }

  const settings = await loadDecryptedSettingsForServer(membership.organization_id);
  if (!settings || !settings.medusaUrl || !settings.medusaApiKey || settings.storePlatform !== 'medusa') {
    return { ok: false, status: 400, error: 'MedusaJS integration not configured' };
  }

  // Normalize URL: remove trailing slash and any existing /admin prefix to avoid duplication.
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

  return { ok: true, baseUrl, headers };
}

/**
 * Make a request to Medusa Admin API.
 *
 * @param endpoint - Medusa API endpoint (e.g., '/admin/products' or 'products')
 * @param options - Fetch options (method, body, etc.)
 */
export async function medusaRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const auth = await getMedusaAuth();
  if (!auth.ok) {
    throw new Error(`Medusa auth failed: ${auth.error}`);
  }

  // Ensure endpoint starts with /admin
  const normalizedEndpoint = endpoint.startsWith('/admin') ? endpoint : `/admin/${endpoint}`;
  const url = `${auth.baseUrl}${normalizedEndpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      ...auth.headers,
      ...options.headers,
    },
    cache: 'no-store',
  });
}
