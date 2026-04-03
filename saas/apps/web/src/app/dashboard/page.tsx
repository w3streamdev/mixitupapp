"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface StatsData {
  commands: number;
  counters: number;
  currencies: number;
  users: number;
}

interface CommandExecution {
  id: string;
  commandName: string;
  triggeredBy: string;
  triggeredAt: string;
  status: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData>({
    commands: 0,
    counters: 0,
    currencies: 0,
    users: 0,
  });
  const [recentExecutions, setRecentExecutions] = useState<CommandExecution[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [commandsRes] = await Promise.allSettled([
          apiClient<{ items?: unknown[]; data?: unknown[]; total?: number }>(
            "/api/v2/commands"
          ),
        ]);

        if (commandsRes.status === "fulfilled") {
          const cmds =
            commandsRes.value.items || commandsRes.value.data || [];
          setStats((prev) => ({
            ...prev,
            commands: Array.isArray(cmds)
              ? cmds.length
              : commandsRes.value.total || 0,
          }));
        }

        // Try to load recent executions
        try {
          const execRes = await apiClient<{
            items?: CommandExecution[];
            data?: CommandExecution[];
          }>("/api/v2/commands/history?limit=10");
          setRecentExecutions(execRes.items || execRes.data || []);
        } catch {
          // Endpoint may not exist yet
        }
      } catch {
        // Silently handle - stats will show 0
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const statCards = [
    {
      label: "Commands",
      value: stats.commands,
      icon: "\u{1F4AC}",
      color: "from-brand-500 to-brand-700",
    },
    {
      label: "Counters",
      value: stats.counters,
      icon: "\u{1F522}",
      color: "from-blue-500 to-blue-700",
    },
    {
      label: "Currencies",
      value: stats.currencies,
      icon: "\u{1FA99}",
      color: "from-amber-500 to-amber-700",
    },
    {
      label: "Users",
      value: stats.users,
      icon: "\u{1F465}",
      color: "from-emerald-500 to-emerald-700",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-400 mt-1">
          Overview of your stream management platform
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-surface-800 bg-surface-850 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} opacity-20`}
              />
            </div>
            <div className="text-3xl font-bold">
              {loading ? (
                <span className="inline-block w-12 h-8 bg-surface-700 rounded animate-pulse" />
              ) : (
                card.value
              )}
            </div>
            <div className="text-sm text-slate-400 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-surface-800 bg-surface-850 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/commands"
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
          >
            + Create Command
          </Link>
          <Link
            href="/dashboard/connect"
            className="px-4 py-2 rounded-lg border border-surface-700 hover:border-brand-600 text-white text-sm font-medium transition-colors"
          >
            Connect Twitch
          </Link>
        </div>
      </div>

      {/* Recent executions */}
      <div className="rounded-xl border border-surface-800 bg-surface-850 p-6">
        <h2 className="text-lg font-semibold mb-4">
          Recent Command Executions
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-10 bg-surface-700 rounded animate-pulse"
              />
            ))}
          </div>
        ) : recentExecutions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-surface-700">
                  <th className="pb-2 pr-4 font-medium">Command</th>
                  <th className="pb-2 pr-4 font-medium">Triggered By</th>
                  <th className="pb-2 pr-4 font-medium">Time</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {recentExecutions.map((exec) => (
                  <tr key={exec.id}>
                    <td className="py-2.5 pr-4 font-medium">
                      {exec.commandName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400">
                      {exec.triggeredBy}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400">
                      {new Date(exec.triggeredAt).toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          exec.status === "success"
                            ? "bg-emerald-900/30 text-emerald-400"
                            : "bg-red-900/30 text-red-400"
                        }`}
                      >
                        {exec.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-500">
            <p className="text-3xl mb-2">{"\u{1F4AD}"}</p>
            <p>No recent executions yet.</p>
            <p className="text-sm mt-1">
              Commands will appear here once they are triggered.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
