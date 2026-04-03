import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "w3StreamItUp - Cloud-Powered Stream Commands",
  description:
    "Manage your stream commands, counters, currencies, and integrations from the cloud.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
