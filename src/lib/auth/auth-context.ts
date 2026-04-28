import { createClient } from '@/utils/supabase/server';

export interface AuthUser {
  id: string;
  email?: string;
}

export interface OrgContext {
  user: AuthUser;
  orgId: string;
}

export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

export async function requireAuthenticatedUser(): Promise<AuthUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function getCurrentOrgIdForUser(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return membership?.organization_id ?? null;
}

export async function requireOrgMembership(orgId: string): Promise<OrgContext> {
  const user = await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!membership?.organization_id) {
    throw new Error('Forbidden');
  }

  return { user, orgId };
}

export async function requireCurrentOrgContext(): Promise<OrgContext> {
  const user = await requireAuthenticatedUser();
  const orgId = await getCurrentOrgIdForUser(user.id);

  if (!orgId) {
    throw new Error('No organization found');
  }

  return { user, orgId };
}
