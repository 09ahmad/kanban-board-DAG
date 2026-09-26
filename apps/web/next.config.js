/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/types'],
  output: 'standalone',
};

export default nextConfig;
