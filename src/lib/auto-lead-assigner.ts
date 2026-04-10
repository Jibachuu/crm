import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Picks the next user to assign an auto-created lead to, using round-robin.
 *
 * Returns the userId of the user who has the OLDEST last_auto_lead_at timestamp
 * among users with auto_lead_assignee = true. Updates that user's last_auto_lead_at
 * so the next call returns a different user. NULLs come first, so newly enabled
 * users get the next lead.
 *
 * Returns null if no users opted in for auto-lead distribution.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickAutoLeadAssignee(admin: SupabaseClient<any>): Promise<string | null> {
  const { data: candidates } = await admin
    .from("users")
    .select("id, last_auto_lead_at")
    .eq("auto_lead_assignee", true)
    .eq("is_active", true)
    .order("last_auto_lead_at", { ascending: true, nullsFirst: true })
    .limit(1);

  const winner = candidates?.[0];
  if (!winner) return null;

  // Mark this user as just-assigned so the next call picks someone else
  await admin
    .from("users")
    .update({ last_auto_lead_at: new Date().toISOString() })
    .eq("id", winner.id);

  return winner.id;
}
