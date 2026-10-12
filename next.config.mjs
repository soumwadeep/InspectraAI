// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Read at request time on the server, so changing the API host is an env-var
  // change and a restart — not a rebuild of the client bundle.
  async rewrites() {
    const target = process.env.BACKEND_ORIGIN || "http://localhost:8000";
    return [
      {
        source: "/backend-api/:path*",
        destination: `${target.replace(/\/$/, "")}/:path*`,
      },
    ];
  },

  images: {
    domains: ['images.unsplash.com', 'avatars.githubusercontent.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.inspectra-ai.com',
      },
    ],
  },
};

export default nextConfig;
