import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches all rows from a Supabase table, bypassing the server-side max_rows=1000 limit
 * by paginating in chunks of 1000.
 *
 * Pass `notDeleted: true` to filter out soft-deleted rows (`deleted_at IS NULL`).
 * Use this for any list/detail loader that runs on the admin client — admin
 * bypasses RLS, so without the explicit filter soft-deleted rows leak back
 * into the UI.
 */
export async function fetchAll<T = unknown>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  opts: {
    order?: { column: string; ascending?: boolean };
    eq?: Record<string, unknown>;
    notDeleted?: boolean;
  } = {}
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(select);
    if (opts.eq) {
      for (const [col, val] of Object.entries(opts.eq)) {
        q = q.eq(col, val);
      }
    }
    if (opts.notDeleted) q = q.is("deleted_at", null);
    if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
    q = q.range(offset, offset + PAGE - 1);

    const { data, error } = await q;
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return all;
}
