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
      {/*
        Body deliberately has NO dark: variant. Dark mode is scoped to the
        marketing site + login (see their own wrapper divs) and must not
        leak into the dashboard app, which has its own separate, light-only
        design system built earlier and isn't part of this change.
      */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
