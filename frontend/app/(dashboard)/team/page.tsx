"use client";

import { useEffect, useState } from "react";
import { UsersThree } from "@phosphor-icons/react";
import { api, ApiError, Role, User, Workspace } from "@/lib/api-client";
import { canManage, useCurrentUser } from "@/lib/CurrentUserContext";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";

interface OwnershipEntry {
  actor_identifier: string;
  owner_user_id: string;
}

const ROLES: Role[] = ["admin", "reviewer", "viewer"];

export default function TeamPage() {
  const isAdmin = canManage(useCurrentUser());
  const [users, setUsers] = useState<User[]>([]);
  const [ownership, setOwnership] = useState<OwnershipEntry[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState<{ email: string; password: string; role: Role; can_review: boolean }>({
    email: "",
    password: "",
    role: "viewer",
    can_review: false,
  });
  const [ownershipForm, setOwnershipForm] = useState({ actor_identifier: "", owner_user_id: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setUsers(await api.get<User[]>("/users"));
    setOwnership(await api.get<OwnershipEntry[]>("/actor-ownership"));
    setWorkspace(await api.get<Workspace>("/workspace"));
  }

  useEffect(() => {
    load();
  }, []);

  async function updateUser(user: User, patch: Partial<Pick<User, "role" | "can_review">>) {
    await api.patch(`/users/${user.id}`, {
      role: patch.role ?? user.role,
      can_review: patch.can_review ?? user.can_review,
    });
    await load();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", newUser);
      setNewUser({ email: "", password: "", role: "viewer", can_review: false });
      setShowAddUser(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add teammate");
    }
  }

  async function addOwnership(e: React.FormEvent) {
    e.preventDefault();
    if (!ownershipForm.actor_identifier || !ownershipForm.owner_user_id) return;
    await api.post("/actor-ownership", ownershipForm);
    setOwnershipForm({ actor_identifier: "", owner_user_id: "" });
    await load();
  }

  async function toggleGeolocation() {
    if (!workspace) return;
    setWorkspace(await api.patch<Workspace>("/workspace/settings", { enable_ip_geolocation: !workspace.enable_ip_geolocation }));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="People"
        title="Team & Ownership"
        description="Who can sign off on an access review, and who's accountable for each service account."
      />

      <section className="space-y-3">
        <SectionHeader
          title="Team members"
          count={users.length}
          actions={
            isAdmin && (
              <button className="btn-secondary btn-sm" onClick={() => setShowAddUser((v) => !v)}>
                {showAddUser ? "Cancel" : "Add teammate"}
              </button>
            )
          }
        />

        {showAddUser && isAdmin && (
          <form onSubmit={addUser} className="card grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Email</span>
              <input
                type="email"
                required
                className="input"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Temporary password</span>
              <input
                type="password"
                required
                className="input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Role</span>
              <select
                className="input"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={newUser.can_review}
                onChange={(e) => setNewUser({ ...newUser, can_review: e.target.checked })}
              />
              <span className="text-sm text-slate-700 dark:text-zinc-300">Authorized reviewer</span>
            </label>
            {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="col-span-full">
              <button type="submit" className="btn-primary">
                Add
              </button>
            </div>
          </form>
        )}

        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Reviewer</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-slate-900 dark:text-zinc-100">{u.email}</td>
                    <td>
                      {isAdmin ? (
                        <select className="input w-auto py-1.5" value={u.role} onChange={(e) => updateUser(u, { role: e.target.value as Role })}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Pill tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Pill>
                      )}
                    </td>
                    <td>
                      {u.can_review ? (
                        <Pill tone="success" dot>
                          authorized
                        </Pill>
                      ) : (
                        <Pill tone="neutral">not a reviewer</Pill>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="text-right">
                        <button className="btn-secondary btn-sm" onClick={() => updateUser(u, { can_review: !u.can_review })}>
                          {u.can_review ? "Revoke reviewer" : "Make reviewer"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Service account ownership"
          count={ownership.length}
          description="Attribute a service account or pipeline credential to a real person, so review items aren't unowned “system” noise."
        />

        {isAdmin && (
          <form onSubmit={addOwnership} className="card flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Actor identifier (DB username)</span>
              <input
                className="input"
                value={ownershipForm.actor_identifier}
                onChange={(e) => setOwnershipForm({ ...ownershipForm, actor_identifier: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-zinc-300">Owner</span>
              <select
                className="input"
                value={ownershipForm.owner_user_id}
                onChange={(e) => setOwnershipForm({ ...ownershipForm, owner_user_id: e.target.value })}
              >
                <option value="">Choose...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </form>
        )}

        <div className="table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Actor identifier</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {ownership.map((o) => (
                  <tr key={o.actor_identifier}>
                    <td>
                      <span className="mono-id">{o.actor_identifier}</span>
                    </td>
                    <td>{users.find((u) => u.id === o.owner_user_id)?.email || o.owner_user_id}</td>
                  </tr>
                ))}
                {ownership.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-0">
                      <EmptyState
                        icon={UsersThree}
                        title="No service accounts attributed yet"
                        hint="Unowned service accounts show up as “unattributed” in every review cycle until someone is named."
                        compact
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Workspace settings" />
        {workspace && (
          <div className="card flex flex-col items-start gap-4 sm:flex-row sm:justify-between sm:gap-6">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">IP geolocation for region confidence</p>
              <p className="mt-1 max-w-[60ch] text-sm text-slate-500 dark:text-zinc-400">
                When a source IP doesn't match your CIDR map, look it up via a third-party geolocation service
                (ip-api.com) instead of leaving it unknown. Off by default: this sends the IP to an external service.
                Never sent for private/internal addresses regardless of this setting.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {workspace.enable_ip_geolocation ? (
                <Pill tone="success" dot>
                  enabled
                </Pill>
              ) : (
                <Pill tone="neutral">off</Pill>
              )}
              {isAdmin && (
                <button className="btn-secondary btn-sm" onClick={toggleGeolocation}>
                  {workspace.enable_ip_geolocation ? "Disable" : "Enable"}
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
