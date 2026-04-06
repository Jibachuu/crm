"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { getInitials } from "@/lib/utils";
import { Plus, Edit2, Shield } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "admin", label: "Администратор", desc: "Полный доступ, видит всё" },
  { value: "supervisor", label: "Руководитель", desc: "Видит все записи, не может управлять пользователями" },
  { value: "manager", label: "Менеджер", desc: "Видит только свои записи" },
];
const ROLE_VARIANTS: Record<string, "danger" | "info" | "default"> = {
  admin: "danger", supervisor: "info", manager: "default",
};

const SECTIONS = [
  { key: "leads", label: "Лиды" },
  { key: "deals", label: "Сделки" },
  { key: "contacts", label: "Контакты" },
  { key: "companies", label: "Компании" },
  { key: "products", label: "Товары" },
  { key: "tasks", label: "Задачи" },
  { key: "inbox", label: "Inbox" },
  { key: "analytics", label: "Аналитика" },
];

type Perm = { resource: string; can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function UsersSettings({ users: initialUsers, permissions: initialPermissions }: { users: any[]; permissions: any[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [allPermissions, setAllPermissions] = useState<Perm[]>(initialPermissions);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<typeof initialUsers[0] | null>(null);
  const [permUser, setPermUser] = useState<typeof initialUsers[0] | null>(null);

  // ── Create user ──────────────────────────────────────────────────────────────
  async function handleCreate(form: { full_name: string; email: string; password: string; role: string }) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return false; }
    setUsers((prev) => [...prev, data.user]);
    return true;
  }

  // ── Edit user ────────────────────────────────────────────────────────────────
  async function handleEdit(id: string, form: { full_name?: string; email?: string; password?: string; role?: string }) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return false; }
    setUsers((prev) => prev.map((u) => u.id === id ? data.user : u));
    return true;
  }

  // ── Toggle active ─────────────────────────────────────────────────────────────
  async function toggleActive(id: string, is_active: boolean) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active }),
    });
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_active } : u));
  }

  // ── Save permissions ──────────────────────────────────────────────────────────
  async function savePermissions(user_id: string, perms: Perm[]) {
    const res = await fetch("/api/admin/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, permissions: perms }),
    });
    if (!res.ok) { alert("Ошибка сохранения прав"); return false; }
    setAllPermissions((prev) => [
      ...prev.filter((p) => p.resource.split(":")[0] !== user_id), // remove old
      ...perms.map((p) => ({ ...p, resource: p.resource })),
    ]);
    return true;
  }

  function getUserPerms(userId: string): Perm[] {
    const userPerms = allPermissions.filter((p) => (p as unknown as { user_id: string }).user_id === userId);
    return SECTIONS.map((s) => {
      const existing = userPerms.find((p) => p.resource === s.key);
      return existing ?? { resource: s.key, can_read: true, can_create: true, can_update: true, can_delete: false };
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: "#222" }}>Сотрудники</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={13} /> Добавить сотрудника
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e4", background: "#fafafa" }}>
                  {["Сотрудник", "Роль", "Статус", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "#888" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: user.is_placeholder ? "#f0f0f0" : "#e8f4fd", color: user.is_placeholder ? "#999" : "#0067a5" }}>
                          {getInitials(user.full_name)}
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: "#333" }}>
                            {user.full_name}
                            {user.is_placeholder && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "#fff3cd", color: "#856404" }}>не зарегистрирован</span>}
                          </p>
                          <p className="text-xs" style={{ color: "#aaa" }}>{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLE_VARIANTS[user.role] ?? "default"}>
                        {ROLE_OPTIONS.find((r) => r.value === user.role)?.label ?? user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.is_active ? "success" : "default"}>
                        {user.is_active ? "Активен" : "Отключён"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditUser(user)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded transition-colors"
                          style={{ border: "1px solid #d0d0d0", color: "#555" }}
                          title="Изменить данные"
                        >
                          <Edit2 size={11} /> Данные
                        </button>
                        <button
                          onClick={() => setPermUser(user)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded transition-colors"
                          style={{ border: "1px solid #d0d0d0", color: "#555" }}
                          title="Права доступа"
                        >
                          <Shield size={11} /> Права
                        </button>
                        <button
                          onClick={() => toggleActive(user.id, !user.is_active)}
                          className="text-xs px-2.5 py-1.5 rounded transition-colors"
                          style={{
                            border: `1px solid ${user.is_active ? "#ffcdd2" : "#c8e6c9"}`,
                            color: user.is_active ? "#c62828" : "#2e7d32",
                          }}
                          title={user.is_active ? "Заблокировать вход в систему" : "Разрешить вход в систему"}
                        >
                          {user.is_active ? "Заблокировать" : "Разблокировать"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Create user modal */}
      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={async (form) => { const ok = await handleCreate(form); if (ok) setCreateOpen(false); }}
      />

      {/* Edit user modal */}
      {editUser && (
        <EditUserModal
          open
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={async (form) => { const ok = await handleEdit(editUser.id, form); if (ok) setEditUser(null); }}
        />
      )}

      {/* Permissions modal */}
      {permUser && (
        <PermissionsModal
          open
          user={permUser}
          initialPerms={getUserPerms(permUser.id)}
          onClose={() => setPermUser(null)}
          onSave={async (perms) => {
            const ok = await savePermissions(permUser.id, perms);
            if (ok) setPermUser(null);
          }}
          onRoleChange={async (role) => {
            await handleEdit(permUser.id, { role });
            setPermUser((u: typeof permUser) => u ? { ...u, role } : null);
          }}
        />
      )}
    </div>
  );
}

// ── Create User Modal ────────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose, onSave }: {
  open: boolean; onClose: () => void;
  onSave: (f: { full_name: string; email: string; password: string; role: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "manager" });
  const [loading, setLoading] = useState(false);

  const inp = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSave(form);
    setLoading(false);
    setForm({ full_name: "", email: "", password: "", role: "manager" });
  }

  const s = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lbl = { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: 4 };

  return (
    <Modal open={open} onClose={onClose} title="Добавить сотрудника" size="sm">
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <label style={lbl}>Имя и фамилия</label>
          <input required value={form.full_name} onChange={(e) => inp("full_name", e.target.value)} style={s} placeholder="Иванова Анна" />
        </div>
        <div>
          <label style={lbl}>Email (логин для входа)</label>
          <input required type="email" value={form.email} onChange={(e) => inp("email", e.target.value)} style={s} placeholder="anna@company.ru" />
        </div>
        <div>
          <label style={lbl}>Пароль</label>
          <input required type="password" value={form.password} onChange={(e) => inp("password", e.target.value)} style={s} placeholder="Минимум 6 символов" minLength={6} />
        </div>
        <div>
          <label style={lbl}>Роль</label>
          <select value={form.role} onChange={(e) => inp("role", e.target.value)} style={s}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="secondary" type="button" onClick={onClose}>Отмена</Button>
          <Button size="sm" type="submit" loading={loading}>Создать</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit User Modal ──────────────────────────────────────────────────────────────
function EditUserModal({ open, user, onClose, onSave }: {
  open: boolean; user: Record<string, string>; onClose: () => void;
  onSave: (f: { full_name?: string; email?: string; password?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ full_name: user.full_name ?? "", email: user.email ?? "", password: "" });
  const [loading, setLoading] = useState(false);

  const inp = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const payload: Record<string, string> = { full_name: form.full_name, email: form.email };
    if (form.password) payload.password = form.password;
    await onSave(payload);
    setLoading(false);
  }

  const s = { border: "1px solid #d0d0d0", borderRadius: 4, padding: "6px 10px", fontSize: 13, width: "100%", outline: "none" };
  const lbl = { fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: 4 };

  return (
    <Modal open={open} onClose={onClose} title={`Изменить данные: ${user.full_name}`} size="sm">
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <label style={lbl}>Имя и фамилия</label>
          <input required value={form.full_name} onChange={(e) => inp("full_name", e.target.value)} style={s} />
        </div>
        <div>
          <label style={lbl}>Email</label>
          <input required type="email" value={form.email} onChange={(e) => inp("email", e.target.value)} style={s} />
        </div>
        <div>
          <label style={lbl}>Новый пароль <span style={{ fontWeight: 400, textTransform: "none", color: "#bbb" }}>(оставьте пустым чтобы не менять)</span></label>
          <input type="password" value={form.password} onChange={(e) => inp("password", e.target.value)} style={s} placeholder="••••••••" minLength={6} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="secondary" type="button" onClick={onClose}>Отмена</Button>
          <Button size="sm" type="submit" loading={loading}>Сохранить</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Permissions Modal ────────────────────────────────────────────────────────────
function PermissionsModal({ open, user, initialPerms, onClose, onSave, onRoleChange }: {
  open: boolean; user: Record<string, string>; initialPerms: Perm[]; onClose: () => void;
  onSave: (perms: Perm[]) => Promise<void>;
  onRoleChange: (role: string) => Promise<void>;
}) {
  const [perms, setPerms] = useState<Perm[]>(initialPerms);
  const [role, setRole] = useState(user.role ?? "manager");
  const [loading, setLoading] = useState(false);

  function toggle(resource: string, field: keyof Perm, val: boolean) {
    setPerms((prev) => prev.map((p) => p.resource === resource ? { ...p, [field]: val } : p));
  }

  function toggleAll(resource: string, val: boolean) {
    setPerms((prev) => prev.map((p) => p.resource === resource
      ? { ...p, can_read: val, can_create: val, can_update: val, can_delete: val }
      : p
    ));
  }

  async function submit() {
    setLoading(true);
    await onRoleChange(role);
    await onSave(perms);
    setLoading(false);
  }

  const cb = (checked: boolean, onChange: (v: boolean) => void) => (
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
      style={{ accentColor: "#0067a5", width: 15, height: 15, cursor: "pointer" }} />
  );

  return (
    <Modal open={open} onClose={onClose} title={`Права: ${user.full_name}`} size="lg">
      <div className="p-5">
        {/* Scope */}
        <div className="mb-5 p-3 rounded" style={{ background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "#555" }}>Область видимости данных</p>
          <div className="flex gap-3">
            {ROLE_OPTIONS.filter((r) => r.value !== "admin").map((r) => (
              <label key={r.value} className="flex items-start gap-2 cursor-pointer flex-1 p-2 rounded"
                style={{ border: `1px solid ${role === r.value ? "#0067a5" : "#ddd"}`, background: role === r.value ? "#e8f4fd" : "#fff" }}>
                <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)}
                  style={{ marginTop: 2, accentColor: "#0067a5" }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: "#333" }}>{r.label}</p>
                  <p className="text-xs" style={{ color: "#888" }}>{r.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Permissions table */}
        <div className="rounded overflow-hidden" style={{ border: "1px solid #e4e4e4" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#fafafa", borderBottom: "1px solid #e4e4e4" }}>
                <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: "#888" }}>Раздел</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold" style={{ color: "#888" }}>Видит</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold" style={{ color: "#888" }}>Создание</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold" style={{ color: "#888" }}>Редактир.</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold" style={{ color: "#888" }}>Удаление</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold" style={{ color: "#888" }}>Всё</th>
              </tr>
            </thead>
            <tbody>
              {perms.map((p) => {
                const section = SECTIONS.find((s) => s.key === p.resource);
                return (
                  <tr key={p.resource} style={{ borderBottom: "1px solid #f0f0f0", opacity: p.can_read ? 1 : 0.5 }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: "#333" }}>{section?.label ?? p.resource}</td>
                    <td className="px-3 py-2.5 text-center">{cb(p.can_read, (v) => toggle(p.resource, "can_read", v))}</td>
                    <td className="px-3 py-2.5 text-center">{cb(p.can_create, (v) => toggle(p.resource, "can_create", v))}</td>
                    <td className="px-3 py-2.5 text-center">{cb(p.can_update, (v) => toggle(p.resource, "can_update", v))}</td>
                    <td className="px-3 py-2.5 text-center">{cb(p.can_delete, (v) => toggle(p.resource, "can_delete", v))}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => toggleAll(p.resource, !p.can_read)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ border: "1px solid #ddd", color: "#666" }}>
                        {p.can_read && p.can_create && p.can_update && p.can_delete ? "Снять" : "Всё"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={submit} loading={loading}>Сохранить права</Button>
        </div>
      </div>
    </Modal>
  );
}
