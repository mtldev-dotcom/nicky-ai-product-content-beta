import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';

export const runtime = 'nodejs';

/**
 * Medusa Admin Product proxy (entity-level).
 *
 * Supports:
 * - GET /api/medusa/products/:id      -> GET /admin/products/:id
 * - POST /api/medusa/products/:id     -> POST /admin/products/:id (Medusa uses POST for updates)
 * - DELETE /api/medusa/products/:id   -> DELETE /admin/products/:id
 */

const UpdateProductSchema = z.object({
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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const auth = await getOrgAndMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const res = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
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
    const message = error instanceof Error ? error.message : 'Failed to fetch Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const auth = await getOrgAndMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { payload } = UpdateProductSchema.parse(await req.json());

    const res = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
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
    const message = error instanceof Error ? error.message : 'Failed to update Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const auth = await getOrgAndMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const res = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
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
    const message = error instanceof Error ? error.message : 'Failed to delete Medusa product';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


