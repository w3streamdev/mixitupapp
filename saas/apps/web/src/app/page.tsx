import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-surface-800 bg-surface-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
              w3StreamItUp
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-surface-100 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="text-sm px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-brand-700/50 bg-brand-900/30 text-brand-300 text-sm font-medium">
            Now in Early Access
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-blue-400 bg-clip-text text-transparent">
              Cloud-Powered
            </span>
            <br />
            Stream Commands
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Manage chat commands, counters, currencies, and integrations from
            anywhere. Built for streamers who want reliability without the
            desktop dependency.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/login"
              className="px-8 py-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-lg transition-colors shadow-lg shadow-brand-600/25"
            >
              Get Started Free
            </Link>
            <Link
              href="#features"
              className="px-8 py-3 rounded-lg border border-surface-700 hover:border-brand-600 text-white font-semibold text-lg transition-colors"
            >
              Learn More
            </Link>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything you need to level up your stream
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((f) => (
              <div
                key={f.title}
                className="p-6 rounded-xl border border-surface-800 bg-surface-850 hover:border-brand-700/50 transition-colors"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-slate-400 leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-3xl mx-auto px-6 py-20 text-center">
          <div className="p-10 rounded-2xl border border-brand-700/30 bg-gradient-to-b from-brand-900/20 to-surface-900">
            <h2 className="text-3xl font-bold mb-4">Ready to go cloud?</h2>
            <p className="text-slate-400 mb-8">
              Join streamers who have already moved their commands to the cloud.
            </p>
            <Link
              href="/login"
              className="inline-block px-8 py-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-lg transition-colors shadow-lg shadow-brand-600/25"
            >
              Create Your Account
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-800 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <span>
            &copy; {new Date().getFullYear()} w3StreamItUp. All rights reserved.
          </span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">
              Docs
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Discord
            </a>
            <a href="#" className="hover:text-white transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: "\u{1F4AC}",
    title: "Chat Commands",
    description:
      "Create and manage chat commands that work across Twitch, YouTube, and Trovo. No desktop app required.",
  },
  {
    icon: "\u{1F522}",
    title: "Counters & Currency",
    description:
      "Track viewer points, death counters, and custom currencies with cloud-synced state.",
  },
  {
    icon: "\u26A1",
    title: "Real-Time Events",
    description:
      "React to subs, raids, and follows instantly with webhook-driven event handlers.",
  },
  {
    icon: "\u{1F50C}",
    title: "Platform Integrations",
    description:
      "Connect Twitch, YouTube, Trovo, and more with secure OAuth. Manage tokens from one dashboard.",
  },
  {
    icon: "\u{1F4E6}",
    title: "Desktop Migration",
    description:
      "Import your existing MixItUp desktop settings and commands. Zero-downtime transition.",
  },
  {
    icon: "\u{1F6E1}\uFE0F",
    title: "Always Online",
    description:
      "Cloud-native architecture means your commands work even when your PC is off. 99.9% uptime SLA.",
  },
];
