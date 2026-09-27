/** @type {import('next').NextConfig} */

// The Docker image hands the browser same-origin paths (`/api`, `/ws`) so the
// page never talks to a host other than the one that served it. Something
// still has to forward them, and that is Next: `/api` to the REST service,
// `/ws` to the WebSocket service.
//
// Both destinations are baked into routes-manifest.json by `next build`, so
// they have to be known at build time — see the API_INTERNAL_URL and
// WS_INTERNAL_URL build args in docker/Dockerfile.web. Setting them only as
// container environment variables would be too late.
//
// Absolute URLs, which is what local development uses, already name the right
// host, so the rewrites stay off.
const apiPublicUrl = process.env.NEXT_PUBLIC_API_URL || "";
const wsPublicUrl = process.env.NEXT_PUBLIC_WS_URL || "";
const isSameOrigin = (value) => value.startsWith("/");

const apiInternalUrl = process.env.API_INTERNAL_URL || "http://server:4000";
const wsInternalUrl = process.env.WS_INTERNAL_URL || "http://ws-server:4001";

const nextConfig = {
  transpilePackages: ['@repo/types'],
  output: 'standalone',
  async rewrites() {
    const routes = [];

    if (isSameOrigin(apiPublicUrl)) {
      routes.push({
        source: "/api/:path*",
        destination: `${apiInternalUrl}/api/:path*`,
      });
    }

    if (isSameOrigin(wsPublicUrl)) {
      routes.push({
        source: "/ws",
        destination: `${wsInternalUrl}/ws`,
      });
    }

    return routes;
  },
};

export default nextConfig;
