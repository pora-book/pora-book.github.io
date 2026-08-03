import { defineConfig } from 'astro/config';

// pora-book.github.io is a user/org GitHub Pages site → served at the domain
// root, so no `base` path is needed. Served under the custom domain
// porabook.com (see public/CNAME).
export default defineConfig({
  site: 'https://porabook.com',
  build: { format: 'directory' },
});
