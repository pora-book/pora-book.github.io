import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// pora-book.github.io is a user/org GitHub Pages site → served at the domain
// root, so no `base` path is needed. Served under the custom domain
// porabook.com (see public/CNAME).
//
// `site` is also what @astrojs/sitemap needs to emit absolute URLs: the build
// writes dist/sitemap-index.xml (+ sitemap-0.xml) covering every generated
// page, including the 22 chapters under /book/. public/robots.txt points
// crawlers at it, and it is the file to submit in Google Search Console.
export default defineConfig({
  site: 'https://porabook.com',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
