/** @type {import('next').NextConfig} */
const nextConfig = {
  // update.sh / `ultralive update` build into a side directory (NEXT_DIST_DIR) and swap it in,
  // so the running site is never left half-built.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
