import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches all rows from a Supabase table, bypassing the server-side max_rows=1000 limit
 * by paginating in chunks of 1000.
 */
export async function fetchAll<T = unknown>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  opts: {
    order?: { column: string; ascending?: boolean };
    filters?: (q: ReturnType<SupabaseClient["from"]>) => ReturnType<SupabaseClient["from"]>;
  } = {}
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(select);
    if (opts.filters) q = opts.filters(q);
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
