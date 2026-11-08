/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // L'app n'utilise pas next/image (uniquement des <img> simples). Couper
    // l'optimiseur ferme /_next/image, vecteur de plusieurs failles Next 14
    // non corrigées dans la branche 14.x (GHSA-2464-fhr4-w9xw,
    // GHSA-2xp9-vwfh-vxw4, GHSA-h64f-5h5j-jqjh, GHSA-9g9p-9gw9-jx7f).
    unoptimized: true
  }
};

export default nextConfig;
