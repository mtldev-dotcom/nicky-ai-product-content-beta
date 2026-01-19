import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { StudioAssetListQuerySchema } from '@/lib/api-schemas';

/**
 * GET /api/studio-assets
 * 
 * Lists studio assets (models and studios) for the user's organization.
 * 
 * Query parameters:
 * - type?: 'model' | 'studio' (filter by type)
 * - limit?: number (default: 50, max: 100)
 * - offset?: number (default: 0)
 * - search?: string (search by name)
 * 
 * Returns:
 * - assets: Array of asset objects
 * - total: Total count (for pagination)
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get organization for user
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const orgId = membership.organization_id;

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const query = StudioAssetListQuerySchema.parse({
      type: searchParams.get('type') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
      search: searchParams.get('search') || undefined,
    });

    // Build query
    let dbQuery = supabase
      .from('studio_assets')
      .select('id, type, name, image_url, thumbnail_url, metadata, created_at', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (query.type) {
      dbQuery = dbQuery.eq('type', query.type);
    }

    if (query.search) {
      dbQuery = dbQuery.ilike('name', `%${query.search}%`);
    }

    // Apply pagination
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    dbQuery = dbQuery.range(offset, offset + limit - 1);

    const { data: assets, error, count } = await dbQuery;

    if (error) {
      console.error('Failed to fetch assets:', error);
      return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
    }

    return NextResponse.json({
      assets: assets || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}
