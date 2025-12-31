import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';
import { loadDecryptedSettingsForServer } from '@/app/settings/actions';
import { saveProductToCloud } from '@/app/products/actions';
import { mapMedusaProductToLocalSavePayload } from '@/lib/medusa/map-medusa-product-to-local';

export const runtime = 'nodejs';

/**
 * Export (copy) or Move (copy+delete) a Medusa product into local Supabase storage.
 *
 * POST body:
 * - mode: "copy" | "move"
 *
 * Behavior:
 * - Always retrieves the product from Medusa (Admin API).
 * - Saves a new row in local `products` (org-scoped via `saveProductToCloud`).
 * - If mode === "move", also deletes the product from Medusa after the local save succeeds.
 */

const ExportSchema = z.object({
  mode: z.enum(['copy', 'move']),
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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 });

    const { mode } = ExportSchema.parse(await req.json());

    const auth = await getOrgAndMedusaAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Retrieve full product so we can map to editor-friendly local shape.
    const retrieveRes = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: auth.headers,
      cache: 'no-store',
    });

    const retrieveText = await retrieveRes.text();
    const retrieveJson = (() => {
      try {
        return JSON.parse(retrieveText) as unknown;
      } catch {
        return { raw: retrieveText };
      }
    })();

    if (!retrieveRes.ok) {
      return NextResponse.json(
        { error: `Medusa API error: ${retrieveRes.status} ${retrieveRes.statusText}`, details: retrieveJson },
        { status: 502 }
      );
    }

    const productObj =
      typeof retrieveJson === 'object' && retrieveJson !== null && 'product' in (retrieveJson as any)
        ? (retrieveJson as any).product
        : retrieveJson;

    const local = mapMedusaProductToLocalSavePayload({
      medusaProduct: productObj,
      keepLinked: mode === 'copy',
    });

    const { id: localProductId } = await saveProductToCloud({
      title: local.title,
      handle: local.handle,
      status: local.status,
      sku: local.sku,
      price: local.price,
      data: local.data,
    });

    let deletedFromMedusa = false;

    if (mode === 'move') {
      const delRes = await fetch(`${auth.baseUrl}/admin/products/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: auth.headers,
        cache: 'no-store',
      });

      const delText = await delRes.text();
      const delJson = (() => {
        try {
          return JSON.parse(delText) as unknown;
        } catch {
          return { raw: delText };
        }
      })();

      if (!delRes.ok) {
        // Important: we already saved locally. Return 502 with extra details so the UI can inform user.
        return NextResponse.json(
          {
            error: `Exported locally, but failed to delete from Medusa: ${delRes.status} ${delRes.statusText}`,
            localProductId,
            details: delJson,
          },
          { status: 502 }
        );
      }

      deletedFromMedusa = true;
    }

    return NextResponse.json({
      success: true,
      localProductId,
      deletedFromMedusa,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export Medusa product to local storage';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


