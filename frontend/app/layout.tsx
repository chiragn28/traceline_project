import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Traceline",
  description: "Audit-ready data access and residency visibility",
};

// Runs before paint so the theme is correct on first frame -- without
// this, a dark-mode visitor sees a flash of the light page every load.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("traceline-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
