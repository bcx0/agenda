/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.geoffreymahieu.com",
        pathname: "/**"
      }
    ]
  }
};

export default nextConfig;
