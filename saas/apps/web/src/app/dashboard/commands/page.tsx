"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";

interface Command {
  id: string;
  name: string;
  type: string;
  isEnabled: boolean;
  triggers?: string[];
  cooldownSeconds?: number;
  createdAt?: string;
}

type CommandType = "all" | "chat" | "timer" | "event" | "webhook";

export default function CommandsPage() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CommandType>("all");
  const [showModal, setShowModal] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);

  const loadCommands = useCallback(async () => {
    try {
      const res = await apiClient<{
        items?: Command[];
        data?: Command[];
      }>("/api/v2/commands");
      setCommands(res.items || res.data || []);
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  const filteredCommands =
    filter === "all"
      ? commands
      : commands.filter(
          (c) => c.type?.toLowerCase() === filter
        );

  async function toggleCommand(cmd: Command) {
    try {
      await apiClient(`/api/v2/commands/${cmd.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: !cmd.isEnabled }),
      });
      setCommands((prev) =>
        prev.map((c) =>
          c.id === cmd.id ? { ...c, isEnabled: !c.isEnabled } : c
        )
      );
    } catch {
      // handle error
    }
  }

  async function deleteCommand(id: string) {
    if (!confirm("Are you sure you want to delete this command?")) return;
    try {
      await apiClient(`/api/v2/commands/${id}`, { method: "DELETE" });
      setCommands((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // handle error
    }
  }

  function openEdit(cmd: Command) {
    setEditingCommand(cmd);
    setShowModal(true);
  }

  function openCreate() {
    setEditingCommand(null);
    setShowModal(true);
  }

  const filterTabs: { value: CommandType; label: string }[] = [
    { value: "all", label: "All" },
    { value: "chat", label: "Chat" },
    { value: "timer", label: "Timer" },
    { value: "event", label: "Event" },
    { value: "webhook", label: "Webhook" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Commands</h1>
          <p className="text-slate-400 mt-1">
            Manage your stream chat commands
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
        >
          + New Command
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-surface-800 w-fit">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.value
                ? "bg-brand-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Commands table */}
      <div className="rounded-xl border border-surface-800 bg-surface-850 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-12 bg-surface-700 rounded animate-pulse"
              />
            ))}
          </div>
        ) : filteredCommands.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-surface-700 bg-surface-800/50">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Triggers</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filteredCommands.map((cmd) => (
                  <tr
                    key={cmd.id}
                    className="hover:bg-surface-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{cmd.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-surface-700 text-slate-300 capitalize">
                        {cmd.type || "chat"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleCommand(cmd)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          cmd.isEnabled ? "bg-brand-600" : "bg-surface-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            cmd.isEnabled
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {cmd.triggers?.join(", ") || "!"+cmd.name.toLowerCase().replace(/\s+/g, "")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(cmd)}
                          className="px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-surface-700 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCommand(cmd.id)}
                          className="px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-500">
            <p className="text-4xl mb-3">{"\u{1F4AC}"}</p>
            <p className="font-medium">No commands yet</p>
            <p className="text-sm mt-1">
              Create your first command to get started.
            </p>
            <button
              onClick={openCreate}
              className="mt-4 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
            >
              + New Command
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <CommandModal
          command={editingCommand}
          onClose={() => {
            setShowModal(false);
            setEditingCommand(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditingCommand(null);
            loadCommands();
          }}
        />
      )}
    </div>
  );
}

function CommandModal({
  command,
  onClose,
  onSaved,
}: {
  command: Command | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = command !== null;
  const [name, setName] = useState(command?.name || "");
  const [type, setType] = useState(command?.type || "chat");
  const [isEnabled, setIsEnabled] = useState(command?.isEnabled ?? true);
  const [cooldownSeconds, setCooldownSeconds] = useState(
    command?.cooldownSeconds ?? 5
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = { name, type, isEnabled, cooldownSeconds };

      if (isEdit) {
        await apiClient(`/api/v2/commands/${command.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient("/api/v2/commands", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save command"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-surface-800 bg-surface-850 p-6 shadow-2xl">
        <h2 className="text-xl font-bold mb-4">
          {isEdit ? "Edit Command" : "Create Command"}
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Command Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              placeholder="e.g. shoutout"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
            >
              <option value="chat">Chat</option>
              <option value="timer">Timer</option>
              <option value="event">Event</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Cooldown (seconds)
            </label>
            <input
              type="number"
              value={cooldownSeconds}
              onChange={(e) => setCooldownSeconds(Number(e.target.value))}
              min={0}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEnabled(!isEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isEnabled ? "bg-brand-600" : "bg-surface-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-slate-300">Enabled</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-surface-700 text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving
                ? "Saving..."
                : isEdit
                  ? "Update Command"
                  : "Create Command"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
