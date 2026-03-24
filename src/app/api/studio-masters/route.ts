import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/studio-masters
 *
 * Lists all master reference images for the user's organization.
 *
 * Returns:
 * - masters: Array of { id, jewelry_type, master_key, public_url, label, created_at }
 */
export async function GET() {
  try {
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

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const orgId = membership.organization_id;

    const { data: masters, error } = await supabase
      .from('studio_master_references')
      .select('id, jewelry_type, master_key, public_url, label, created_at')
      .eq('organization_id', orgId)
      .order('jewelry_type', { ascending: true })
      .order('master_key', { ascending: true });

    if (error) {
      console.error('Failed to fetch master references:', error);
      return NextResponse.json({ error: 'Failed to fetch master references' }, { status: 500 });
    }

    return NextResponse.json({ masters: masters ?? [] });
  } catch (error: unknown) {
    console.error('Studio masters GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch master references' },
      { status: 500 }
    );
  }
}
