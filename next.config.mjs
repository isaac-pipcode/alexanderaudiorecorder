/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Export estático: a UI é servida pelo próprio app Electron (sem servidor Next).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
