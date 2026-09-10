"use client";

import { useEffect, useState } from "react";
import { api, ApiError, User } from "@/lib/api-client";

interface OwnershipEntry {
  actor_identifier: string;
  owner_user_id: string;
}

export default function TeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [ownership, setOwnership] = useState<OwnershipEntry[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", can_review: true });
  const [ownershipForm, setOwnershipForm] = useState({ actor_identifier: "", owner_user_id: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setUsers(await api.get<User[]>("/users"));
    setOwnership(await api.get<OwnershipEntry[]>("/actor-ownership"));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleReview(user: User) {
    await api.patch(`/users/${user.id}`, { can_review: !user.can_review });
    await load();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", newUser);
      setNewUser({ email: "", password: "", can_review: true });
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Team &amp; Ownership</h1>
        <p className="text-sm text-slate-500">
          Who can sign off on an access review, and who's accountable for each service account.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-800">Reviewers</h2>
          <button className="btn-secondary" onClick={() => setShowAddUser((v) => !v)}>
            {showAddUser ? "Cancel" : "Add teammate"}
          </button>
        </div>

        {showAddUser && (
          <form onSubmit={addUser} className="card grid grid-cols-3 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                className="input"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Temporary password</span>
              <input
                type="password"
                required
                className="input"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </label>
            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                checked={newUser.can_review}
                onChange={(e) => setNewUser({ ...newUser, can_review: e.target.checked })}
              />
              <span className="text-sm text-slate-700">Authorized reviewer</span>
            </label>
            {error && <p className="col-span-3 text-sm text-red-600">{error}</p>}
            <div className="col-span-3">
              <button type="submit" className="btn-primary">
                Add
              </button>
            </div>
          </form>
        )}

        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Authorized reviewer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    {u.can_review ? (
                      <span className="badge bg-emerald-100 text-emerald-700">yes</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-500">no</span>
                    )}
                  </td>
                  <td>
                    <button className="btn-secondary" onClick={() => toggleReview(u)}>
                      {u.can_review ? "Revoke reviewer access" : "Grant reviewer access"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-slate-800">Service account ownership</h2>
        <p className="text-sm text-slate-500">
          Attribute a service account / pipeline credential to a real person so review items aren't unowned "system"
          noise.
        </p>

        <form onSubmit={addOwnership} className="card flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Actor identifier (DB username)</span>
            <input
              className="input"
              value={ownershipForm.actor_identifier}
              onChange={(e) => setOwnershipForm({ ...ownershipForm, actor_identifier: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Owner</span>
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

        <div className="card overflow-x-auto">
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
                  <td>{o.actor_identifier}</td>
                  <td>{users.find((u) => u.id === o.owner_user_id)?.email || o.owner_user_id}</td>
                </tr>
              ))}
              {ownership.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-slate-400">
                    No service accounts attributed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
