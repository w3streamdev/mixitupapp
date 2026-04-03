"use client";

import { useEffect, useState } from "react";
import { apiClient, getApiUrl } from "@/lib/api";

interface TwitchConnection {
  connected: boolean;
  username?: string;
  displayName?: string;
  profileImageUrl?: string;
  connectedAt?: string;
}

export default function ConnectPage() {
  const [twitch, setTwitch] = useState<TwitchConnection>({
    connected: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiClient<TwitchConnection>(
          "/api/v2/auth/twitch/status"
        );
        setTwitch(data);
      } catch {
        // Not connected or endpoint doesn't exist yet
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function connectTwitch() {
    const token = localStorage.getItem("token");
    window.location.href = `${getApiUrl()}/api/v2/auth/twitch?token=${token}`;
  }

  async function disconnectTwitch() {
    if (!confirm("Disconnect your Twitch account?")) return;
    try {
      await apiClient("/api/v2/auth/twitch/disconnect", {
        method: "POST",
      });
      setTwitch({ connected: false });
    } catch {
      // handle error
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connections</h1>
        <p className="text-slate-400 mt-1">
          Manage your platform integrations
        </p>
      </div>

      {/* Twitch */}
      <div className="rounded-xl border border-surface-800 bg-surface-850 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-900/30 border border-purple-800/30 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-7 h-7 text-purple-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold">Twitch</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Connect your Twitch account to enable chat commands, event
              listeners, and channel management.
            </p>

            {loading ? (
              <div className="mt-4 h-10 w-48 bg-surface-700 rounded animate-pulse" />
            ) : twitch.connected ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-800 border border-surface-700">
                  {twitch.profileImageUrl && (
                    <img
                      src={twitch.profileImageUrl}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div>
                    <div className="font-medium">
                      {twitch.displayName || twitch.username}
                    </div>
                    <div className="text-xs text-slate-500">
                      Connected{" "}
                      {twitch.connectedAt
                        ? new Date(twitch.connectedAt).toLocaleDateString()
                        : ""}
                    </div>
                  </div>
                  <span className="ml-auto inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/30 text-emerald-400 border border-emerald-800/30">
                    Connected
                  </span>
                </div>

                <button
                  onClick={disconnectTwitch}
                  className="px-4 py-2 rounded-lg border border-red-800/30 text-red-400 hover:bg-red-900/20 text-sm font-medium transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectTwitch}
                className="mt-4 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                </svg>
                Connect Twitch
              </button>
            )}
          </div>
        </div>
      </div>

      {/* YouTube - Coming Soon */}
      <div className="rounded-xl border border-surface-800 bg-surface-850 p-6 opacity-60">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-900/30 border border-red-800/30 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-7 h-7 text-red-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">YouTube</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Connect your YouTube channel for live chat integration and event
              handling.
            </p>
            <span className="mt-4 inline-block px-3 py-1 rounded-lg bg-surface-800 text-sm text-slate-500 font-medium">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* Trovo - Coming Soon */}
      <div className="rounded-xl border border-surface-800 bg-surface-850 p-6 opacity-60">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-green-900/30 border border-green-800/30 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl text-green-400">{"\u{1F3AE}"}</span>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Trovo</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Connect your Trovo channel for chat commands and stream events.
            </p>
            <span className="mt-4 inline-block px-3 py-1 rounded-lg bg-surface-800 text-sm text-slate-500 font-medium">
              Coming Soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
