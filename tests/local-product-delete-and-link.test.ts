import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteProductFromCloud, setLocalProductMedusaId } from '../src/app/products/actions';

type FakeSupabase = {
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
    from: (table: string) => any;
};

type Captured = {
    updatedData?: unknown;
};

function makeFakeSupabase(opts: {
    userId?: string | null;
    orgId?: string | null;
    deleteError?: string | null;
    readData?: unknown | null;
    readError?: string | null;
    updateError?: string | null;
    captured?: Captured;
}): FakeSupabase {
    const state = {
        last: { table: '', op: '', filters: [] as Array<[string, unknown]> },
    };

    const fake: FakeSupabase = {
        auth: {
            getUser: async () => ({ data: { user: opts.userId ? { id: opts.userId } : null } }),
        },
        from: (table: string) => {
            state.last.table = table;
            const chain: any = {
                select: (_sel: string) => chain,
                eq: (k: string, v: unknown) => {
                    state.last.filters.push([k, v]);
                    return chain;
                },
                limit: (_n: number) => chain,
                single: async () => {
                    if (table === 'organization_members') {
                        return { data: opts.orgId ? { organization_id: opts.orgId } : null };
                    }
                    if (table === 'products') {
                        if (opts.readError) return { data: null, error: { message: opts.readError } };
                        return { data: { data: opts.readData ?? null }, error: null };
                    }
                    return { data: null };
                },
                delete: () => {
                    state.last.op = 'delete';
                    return chain;
                },
                update: (_record: unknown) => {
                    state.last.op = 'update';
                    return chain;
                },
            };

            // Execute operations (delete/update) resolve at end of chain.
            chain.then = undefined;
            (chain as any).eq = chain.eq;
            (chain as any).select = chain.select;
            (chain as any).single = chain.single;
            (chain as any).limit = chain.limit;
            (chain as any).delete = chain.delete;
            (chain as any).update = chain.update;

            // Post-chain terminal for delete/update.
            (chain as any).delete = () => ({
                eq: (k1: string, v1: unknown) => ({
                    eq: async (_k2: string, _v2: unknown) => ({
                        error: opts.deleteError ? { message: opts.deleteError } : null,
                    }),
                }),
            });

            (chain as any).update = (record: unknown) => ({
                eq: (k1: string, v1: unknown) => ({
                    eq: async (_k2: string, _v2: unknown) => ({
                        // Capture the update payload so we can assert we wrote merged JSON.
                        ...(opts.captured ? ((opts.captured.updatedData = record), {}) : {}),
                        error: opts.updateError ? { message: opts.updateError } : null,
                    }),
                }),
            });

            return chain;
        },
    };

    return fake;
}

test('deleteProductFromCloud throws when unauthenticated', async () => {
    const supabase = makeFakeSupabase({ userId: null, orgId: 'org_1' }) as any;
    await assert.rejects(() => deleteProductFromCloud('prod_1', supabase), /Unauthorized/);
});

test('setLocalProductMedusaId writes medusa_product_id into existing data object', async () => {
    const captured: Captured = {};
    const supabase = makeFakeSupabase({
        userId: 'user_1',
        orgId: 'org_1',
        readData: { hello: 'world' },
        captured,
    }) as any;

    await setLocalProductMedusaId('prod_1', 'medusa_prod_1', supabase);

    // Ensure we wrote back a merged object containing the Medusa id.
    const record = captured.updatedData as { data?: Record<string, unknown> } | undefined;
    assert.ok(record);
    assert.equal(record?.data?.hello, 'world');
    assert.equal(record?.data?.medusa_product_id, 'medusa_prod_1');
});


