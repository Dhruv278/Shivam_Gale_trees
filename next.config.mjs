/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Static export: `next build` emits a plain `out/` folder of HTML and assets
   * with no server component at runtime.
   *
   * This is a durability decision, not a performance one. The QR codes are printed
   * on physical labels, so the URL they encode has to keep working for years. A
   * static folder can be served by Cloudflare Pages, GitHub Pages, Netlify, S3 or
   * any plain web server, so losing a host means copying a folder rather than
   * porting an application. Nothing in this app needs a server: the portal is
   * client-side and every viewer page is known at build time.
   *
   * Consequence to be aware of: an unknown /view/<slug> is a host-level 404 rather
   * than a rendered not-found page. That is correct for a fixed print run.
   */
  output: 'export',

  /**
   * next/image optimization needs a server, and we deliberately serve the posters
   * as untouched static files anyway - they are print-resolution originals whose
   * fine print must survive pinch-zoom on a phone.
   */
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
