import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';

export const runtime = 'nodejs';

/**
 * Medusa Admin Product proxy (collection-level).
 *
 * Security:
 * - Auth required (Supabase session).
 * - Org derived from membership server-side.
 * - Medusa API key is decrypted server-side and never returned to the browser.
 *
 * Notes:
 * - We normalize the configured Medusa URL to avoid double `/admin` prefixes.
 * - Medusa Admin API supports `x-medusa-access-token` and `Authorization: Basic base64(key:)`.
 *   We send both for compatibility with different Medusa setups.
 */

const CreateProductSchema = z.object({
  payload: z.unknown(),
});

async function getOrgAndMedusaAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!membership?.organization_id) {
    return { ok: false as const, status: 403, error: 'No organization found' };
  }

  const settings = await loadDecryptedSettingsForServer(membership.organization_id);
  if (!settings || !settings.medusaUrl || !settings.medusaApiKey || settings.storePlatform !== 'medusa') {
    return { ok: false as const, status: 400, error: 'MedusaJS integration not configured' };
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

  return { ok: true as const, baseUrl, headers };
}

export async function GET(req: Request) {
  try {
    const auth = await getOrgAndMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    /**
     * Passthrough some supported query params to Medusa.
     * We keep this allowlist tight to avoid accidental open proxy behavior.
     */
    const url = new URL(req.url);
    const allowedKeys = new Set(['limit', 'offset', 'q', 'status', 'fields', 'order', 'with_deleted']);
    const search = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (!allowedKeys.has(key)) return;
      // Support repeated keys (e.g., status=published&status=draft).
      search.append(key, value);
    });

    // Default pagination to keep payloads bounded.
    if (!search.has('limit')) search.set('limit', '20');

    const res = await fetch(`${auth.baseUrl}/admin/products?${search.toString()}`, {
      method: 'GET',
      headers: auth.headers,
      cache: 'no-store',
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
        { error: `Medusa API error: ${res.status} ${res.statusText}`, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Medusa products';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getOrgAndMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { payload } = CreateProductSchema.parse(await req.json());

    const res = await fetch(`${auth.baseUrl}/admin/products`, {
      method: 'POST',
      headers: auth.headers,
      cache: 'no-store',
      body: JSON.stringify(payload),
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
        { error: `Medusa API error: ${res.status} ${res.statusText}`, details: json },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


