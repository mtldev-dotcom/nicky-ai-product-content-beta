import { NextResponse } from 'next/server';
import { requireCurrentOrgContext } from '@/lib/auth/auth-context';

export async function GET() {
  try {
    const context = await requireCurrentOrgContext();
    return NextResponse.json({ orgId: context.orgId, userId: context.user.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status = message === 'Unauthorized' ? 401 : message === 'No organization found' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
