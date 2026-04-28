import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUsageSessionDetail } from '@/lib/data/usage-repository';

const SessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const params = await context.params;
    const { sessionId } = SessionIdSchema.parse(params);
    const detail = await getUsageSessionDetail(sessionId);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Failed to load session detail';
    const status = message === 'Unauthorized' ? 401 : message === 'No organization found' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
