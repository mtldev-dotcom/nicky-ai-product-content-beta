import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listUsageSessions } from '@/lib/data/usage-repository';

const UsageSessionsQuerySchema = z.object({
  module: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = UsageSessionsQuerySchema.parse({
      module: url.searchParams.get('module') || undefined,
      status: url.searchParams.get('status') || undefined,
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    });

    const sessions = await listUsageSessions(parsed);
    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Failed to load sessions';
    const status = message === 'Unauthorized' ? 401 : message === 'No organization found' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
