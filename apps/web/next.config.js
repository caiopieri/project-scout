/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@scout/config',
    '@scout/domain',
    '@scout/schemas',
  ],
};

module.exports = nextConfig;
