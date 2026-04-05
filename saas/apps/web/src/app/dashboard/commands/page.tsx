"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";

// API returns PascalCase fields
interface ApiCommand {
  ID: string;
  Name: string;
  Type: string;
  IsEnabled: boolean;
  Unlocked: boolean;
  GroupName: string | null;
  Definition: CommandDefinition | null;
}

interface CommandDefinition {
  triggers?: Array<{ text: string; isWildcard?: boolean; caseSensitive?: boolean }>;
  requirements?: { roles?: string[]; cooldownSeconds?: number; userCooldownSeconds?: number };
  actions?: Array<{ type: string; message?: string; url?: string; counterId?: string; operation?: string; [key: string]: unknown }>;
  deleteMessage?: boolean;
  timer?: { intervalSeconds?: number; minChatMessages?: number; groupName?: string };
  event?: { eventType?: string; platform?: string };
}

type CommandType = "all" | "chat" | "timer" | "event" | "webhook";

export default function CommandsPage() {
  const [commands, setCommands] = useState<ApiCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CommandType>("all");
  const [showModal, setShowModal] = useState(false);
  const [editingCommand, setEditingCommand] = useState<ApiCommand | null>(null);

  const loadCommands = useCallback(async () => {
    try {
      const res = await apiClient<{ TotalCount: number; Commands: ApiCommand[] }>("/api/v2/commands?pageSize=250");
      setCommands(res.Commands || []);
    } catch (e) {
      console.error("Failed to load commands:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCommands(); }, [loadCommands]);

  const filteredCommands = filter === "all"
    ? commands
    : commands.filter((c) => c.Type?.toLowerCase() === filter);

  async function toggleCommand(cmd: ApiCommand) {
    try {
      await apiClient(`/api/v2/commands/${cmd.ID}/state/2`, { method: "PATCH" });
      setCommands((prev) =>
        prev.map((c) => c.ID === cmd.ID ? { ...c, IsEnabled: !c.IsEnabled } : c)
      );
    } catch (e) {
      console.error("Toggle failed:", e);
    }
  }

  async function deleteCommand(id: string) {
    if (!confirm("Are you sure you want to delete this command?")) return;
    try {
      await apiClient(`/api/v2/commands/${id}`, { method: "DELETE" });
      setCommands((prev) => prev.filter((c) => c.ID !== id));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  function getTriggers(cmd: ApiCommand): string {
    const triggers = cmd.Definition?.triggers;
    if (triggers && triggers.length > 0) {
      return triggers.map((t) => t.text).join(", ");
    }
    return "-";
  }

  function getActionSummary(cmd: ApiCommand): string {
    const actions = cmd.Definition?.actions;
    if (!actions || actions.length === 0) return "No actions";
    const types = actions.map((a) => a.type);
    const unique = [...new Set(types)];
    return unique.join(", ");
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
          <p className="text-slate-400 mt-1">Manage your stream chat commands</p>
        </div>
        <button
          onClick={() => { setEditingCommand(null); setShowModal(true); }}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
        >
          + New Command
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-lg bg-surface-800 w-fit">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.value ? "bg-brand-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-surface-800 bg-surface-850 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-surface-700 rounded animate-pulse" />
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
                  <th className="px-4 py-3 font-medium">Actions</th>
                  <th className="px-4 py-3 font-medium text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {filteredCommands.map((cmd) => (
                  <tr key={cmd.ID} className="hover:bg-surface-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{cmd.Name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-surface-700 text-slate-300 capitalize">
                        {cmd.Type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleCommand(cmd)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          cmd.IsEnabled ? "bg-brand-600" : "bg-surface-700"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          cmd.IsEnabled ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{getTriggers(cmd)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{getActionSummary(cmd)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setEditingCommand(cmd); setShowModal(true); }}
                          className="px-3 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white hover:bg-surface-700 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCommand(cmd.ID)}
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
            <p className="text-sm mt-1">Create your first command to get started.</p>
            <button
              onClick={() => { setEditingCommand(null); setShowModal(true); }}
              className="mt-4 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
            >
              + New Command
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <CommandModal
          command={editingCommand}
          onClose={() => { setShowModal(false); setEditingCommand(null); }}
          onSaved={() => { setShowModal(false); setEditingCommand(null); loadCommands(); }}
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
  command: ApiCommand | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = command !== null;
  const [name, setName] = useState(command?.Name || "");
  const [type, setType] = useState(command?.Type || "chat");
  const [isEnabled, setIsEnabled] = useState(command?.IsEnabled ?? true);
  const [trigger, setTrigger] = useState(command?.Definition?.triggers?.[0]?.text || "");
  const [chatMessage, setChatMessage] = useState(
    command?.Definition?.actions?.find((a) => a.type === "chat")?.message || ""
  );
  const [cooldown, setCooldown] = useState(command?.Definition?.requirements?.cooldownSeconds ?? 0);
  const [deleteMsg, setDeleteMsg] = useState(command?.Definition?.deleteMessage ?? false);
  const [webUrl, setWebUrl] = useState(
    command?.Definition?.actions?.find((a) => a.type === "web_request")?.url || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const actions: Array<Record<string, unknown>> = [];

      if (chatMessage.trim()) {
        actions.push({ type: "chat", message: chatMessage, sendAsReply: false });
      }
      if (webUrl.trim()) {
        actions.push({
          type: "web_request",
          url: webUrl,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "$message", user: "$username", timestamp: "$datetime" }),
          responseIdentifier: "$webrequest",
        });
      }

      const definition: Record<string, unknown> = {
        triggers: trigger.trim()
          ? trigger.split(",").map((t) => ({ text: t.trim(), isWildcard: false, caseSensitive: false }))
          : [],
        requirements: {
          roles: [],
          cooldownSeconds: cooldown,
          userCooldownSeconds: 0,
        },
        actions,
        deleteMessage: deleteMsg,
      };

      const payload = { name, type, isEnabled, definition };

      if (isEdit) {
        await apiClient(`/api/v2/commands/${command.ID}`, {
          method: "PUT",
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
      setError(err instanceof Error ? err.message : "Failed to save command");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-surface-800 bg-surface-850 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{isEdit ? "Edit Command" : "Create Command"}</h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 text-sm">{error}</div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Command Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="e.g. !shoutout" required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Type</label>
            <select
              value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="chat">Chat</option>
              <option value="timer">Timer</option>
              <option value="event">Event</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          {type === "chat" && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Trigger(s) <span className="text-slate-500 font-normal">comma-separated</span>
              </label>
              <input
                type="text" value={trigger} onChange={(e) => setTrigger(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. !so, !shoutout"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Chat Response <span className="text-slate-500 font-normal">supports $username, $args1, $message, etc.</span>
            </label>
            <textarea
              value={chatMessage} onChange={(e) => setChatMessage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-h-[80px]"
              placeholder="e.g. Go check out $args1 at https://twitch.tv/$args1"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Web Request URL <span className="text-slate-500 font-normal">optional</span>
            </label>
            <input
              type="text" value={webUrl} onChange={(e) => setWebUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="https://your-api.com/endpoint"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Cooldown (seconds)</label>
            <input
              type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} min={0}
              className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-700 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <button
                type="button" onClick={() => setIsEnabled(!isEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? "bg-brand-600" : "bg-surface-700"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-slate-300">Enabled</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button" onClick={() => setDeleteMsg(!deleteMsg)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${deleteMsg ? "bg-red-600" : "bg-surface-700"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${deleteMsg ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-slate-300">Delete trigger message</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-surface-700 text-slate-300 hover:text-white text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Saving..." : isEdit ? "Update Command" : "Create Command"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
