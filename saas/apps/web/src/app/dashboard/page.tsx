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

interface Execution {
  ID: string;
  CommandID: string;
  Status: string;
  TriggerType: string;
  Platform: string | null;
  UserID: string | null;
  StartedAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData>({ commands: 0, counters: 0, currencies: 0, users: 0 });
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [cmds, ctrs, curs, usrs, hist] = await Promise.allSettled([
          apiClient<{ TotalCount: number }>("/api/v2/commands"),
          apiClient<{ TotalCount: number }>("/api/v2/counters"),
          apiClient<{ TotalCount: number }>("/api/v2/currency"),
          apiClient<{ TotalCount: number }>("/api/v2/users"),
          apiClient<{ TotalCount: number; Executions: Execution[] }>("/api/v2/commands/history?pageSize=10"),
        ]);

        setStats({
          commands: cmds.status === "fulfilled" ? cmds.value.TotalCount : 0,
          counters: ctrs.status === "fulfilled" ? ctrs.value.TotalCount : 0,
          currencies: curs.status === "fulfilled" ? curs.value.TotalCount : 0,
          users: usrs.status === "fulfilled" ? usrs.value.TotalCount : 0,
        });

        if (hist.status === "fulfilled") {
          setExecutions(hist.value.Executions || []);
        }
      } catch {
        // Stats will show 0
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    { label: "Commands", value: stats.commands, icon: "\u{1F4AC}", color: "from-brand-500 to-brand-700" },
    { label: "Counters", value: stats.counters, icon: "\u{1F522}", color: "from-blue-500 to-blue-700" },
    { label: "Currencies", value: stats.currencies, icon: "\u{1FA99}", color: "from-amber-500 to-amber-700" },
    { label: "Users", value: stats.users, icon: "\u{1F465}", color: "from-emerald-500 to-emerald-700" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-400 mt-1">Overview of your stream management platform</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-surface-800 bg-surface-850 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} opacity-20`} />
            </div>
            <div className="text-3xl font-bold">
              {loading ? <span className="inline-block w-12 h-8 bg-surface-700 rounded animate-pulse" /> : card.value}
            </div>
            <div className="text-sm text-slate-400 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-surface-800 bg-surface-850 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/commands" className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors">
            + Create Command
          </Link>
          <Link href="/dashboard/connect" className="px-4 py-2 rounded-lg border border-surface-700 hover:border-brand-600 text-white text-sm font-medium transition-colors">
            Connect Twitch
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-surface-800 bg-surface-850 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold">Recent Executions</h2>
        </div>
        {executions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-surface-700 bg-surface-800/50">
                  <th className="px-4 py-3 font-medium">Command</th>
                  <th className="px-4 py-3 font-medium">Trigger</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {executions.map((ex) => (
                  <tr key={ex.ID} className="hover:bg-surface-800/30">
                    <td className="px-4 py-3 font-mono text-xs">{ex.CommandID.slice(0, 12)}...</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-surface-700 text-slate-300 capitalize">
                        {ex.TriggerType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        ex.Status === "completed" ? "bg-green-900/30 text-green-400" :
                        ex.Status === "failed" ? "bg-red-900/30 text-red-400" :
                        "bg-yellow-900/30 text-yellow-400"
                      }`}>
                        {ex.Status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(ex.StartedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-slate-500">
            <p className="text-sm">No recent command executions</p>
          </div>
        )}
      </div>
    </div>
  );
}
