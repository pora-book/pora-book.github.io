import { defineConfig } from 'astro/config';

// pora-book.github.io is a user/org GitHub Pages site → served at the domain
// root, so no `base` path is needed.
export default defineConfig({
  site: 'https://pora-book.github.io',
  build: { format: 'directory' },
});
