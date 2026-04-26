import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches all rows from a Supabase table, bypassing the server-side max_rows=1000 limit
 * by paginating in chunks of 1000.
 *
 * Pass `notDeleted: true` to filter out soft-deleted rows (`deleted_at IS NULL`).
 * Use this for any list/detail loader that runs on the admin client — admin
 * bypasses RLS, so without the explicit filter soft-deleted rows leak back
 * into the UI.
 *
 * Pass `limit: N` to cap the total number of rows returned (e.g. for list
 * pages where loading 5000 leads on every navigation kills TTFB). When the
 * cap is hit, the caller can detect it via the `truncated` companion fn.
 */
export async function fetchAll<T = unknown>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  opts: {
    order?: { column: string; ascending?: boolean };
    eq?: Record<string, unknown>;
    notDeleted?: boolean;
    limit?: number;
  } = {}
): Promise<T[]> {
  const PAGE = 1000;
  const cap = opts.limit && opts.limit > 0 ? opts.limit : Number.POSITIVE_INFINITY;
  const all: T[] = [];
  let offset = 0;

  while (all.length < cap) {
    const remaining = cap - all.length;
    const pageSize = Math.min(PAGE, remaining);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(select);
    if (opts.eq) {
      for (const [col, val] of Object.entries(opts.eq)) {
        q = q.eq(col, val);
      }
    }
    if (opts.notDeleted) q = q.is("deleted_at", null);
    if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
    q = q.range(offset, offset + pageSize - 1);

    const { data, error } = await q;
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

/** Cheap COUNT(*) for showing "X total" or "shown N of Y" hints. */
export async function countRows(
  supabase: SupabaseClient,
  table: string,
  opts: { eq?: Record<string, unknown>; notDeleted?: boolean } = {}
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from(table).select("id", { count: "exact", head: true });
  if (opts.eq) {
    for (const [col, val] of Object.entries(opts.eq)) q = q.eq(col, val);
  }
  if (opts.notDeleted) q = q.is("deleted_at", null);
  const { count } = await q;
  return count ?? 0;
}
