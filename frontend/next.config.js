/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy API calls through this app's own origin instead of hitting the
  // Railway backend directly cross-site. The frontend (vercel.app) and
  // backend (railway.app) are different registrable domains, so the auth
  // cookie was a third-party cookie from the browser's point of view --
  // iOS Safari (and increasingly Chrome) blocks that by default, so login
  // silently succeeded but the session cookie was dropped, breaking login
  // on phones while desktop kept working. Routing through /api/* here
  // makes every request same-origin, so the cookie is a normal first-party
  // cookie no matter which browser or tracking-prevention setting a
  // visitor has.
  async rewrites() {
    const backend = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
};

module.exports = nextConfig;
