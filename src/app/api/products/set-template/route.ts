import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const SetTemplateSchema = z.object({
  productId: z.string().min(1),
  isTemplate: z.boolean(),
});

/**
 * Toggle `products.is_template` securely.
 *
 * Security:
 * - Auth required (Supabase session).
 * - Org derived from membership server-side.
 * - Update constrained by (id + organization_id).
 */
export async function POST(req: Request) {
  try {
    const { productId, isTemplate } = SetTemplateSchema.parse(await req.json());

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

    const { data, error } = await supabase
      .from('products')
      .update({ is_template: isTemplate })
      .eq('id', productId)
      .eq('organization_id', membership.organization_id)
      .select('id, is_template')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data.id, is_template: data.is_template });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update template flag';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


