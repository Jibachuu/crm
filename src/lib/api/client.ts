// Browser-side helpers for talking to our admin-backed API endpoints.
// All entity mutations (companies/leads/deals/contacts/communications/tasks)
// MUST go through these helpers — never call supabase.from(...).update/insert
// from a client component, because RLS blocks managers from updating
// company/contact rows they don't own and the failure is silent.
//
// On RLS denial supabase returns `{ data: null, error: null, count: 0 }` and
// the optimistic UI happily displays a fake success. These helpers ensure we
// always go through an admin-client API route and surface the error.

export type ApiResult<T> = { data: T | null; error: string | null };

async function call<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const msg =
        (payload && typeof payload === "object" && "error" in payload && typeof (payload as { error: unknown }).error === "string")
          ? (payload as { error: string }).error
          : `HTTP ${res.status}`;
      return { data: null, error: msg };
    }
    return { data: payload as T, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function apiGet<T = unknown>(path: string) {
  return call<T>(path, { method: "GET" });
}

export function apiPost<T = unknown>(path: string, body: unknown) {
  return call<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPut<T = unknown>(path: string, body: unknown) {
  return call<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiPatch<T = unknown>(path: string, body: unknown) {
  return call<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T = unknown>(path: string, body?: unknown) {
  return call<T>(path, {
    method: "DELETE",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
