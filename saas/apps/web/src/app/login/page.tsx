"use client";

import Link from "next/link";
import { getApiUrl } from "@/lib/api";

export default function LoginPage() {
  const apiUrl = getApiUrl();

  // Build the redirect_uri for after Twitch auth completes
  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard`
      : "";

  const connectUrl = `${apiUrl}/api/v2/auth/twitch/connect?redirect_uri=${encodeURIComponent(redirectUri)}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="block text-center text-2xl font-bold bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent mb-8"
        >
          w3StreamItUp
        </Link>

        <div className="rounded-xl border border-surface-800 bg-surface-850 p-8">
          <h1 className="text-2xl font-bold mb-1 text-center">Welcome</h1>
          <p className="text-slate-400 mb-8 text-sm text-center">
            Sign in to manage your stream commands, events, and integrations.
          </p>

          <a
            href={connectUrl}
            className="w-full py-3 rounded-lg text-white font-semibold transition-colors flex items-center justify-center gap-3 text-base"
            style={{ backgroundColor: "#9146FF" }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#7c3aed")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#9146FF")
            }
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
            </svg>
            Sign in with Twitch
          </a>

          <p className="mt-6 text-center text-xs text-slate-500">
            By signing in, you agree to let w3StreamItUp access your Twitch
            account for chat commands and channel management.
          </p>
        </div>
      </div>
    </div>
  );
}
