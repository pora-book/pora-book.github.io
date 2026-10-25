// Errata are GitHub issues on the site repo, filed through the issue form in
// .github/ISSUE_TEMPLATE/erratum.yml. The query parameters below pre-fill that
// form's fields by id; keep them in sync with the template.

export const ERRATA_REPO = 'pora-book/pora-book.github.io';
export const ERRATA_TEMPLATE = 'erratum.yml';
export const ERRATA_LABEL = 'erratum';
export const CONFIRMED_LABEL = 'confirmed';

export const openReportsUrl =
  `https://github.com/${ERRATA_REPO}/issues?q=is%3Aissue+is%3Aopen+label%3A${ERRATA_LABEL}`;

// GitHub rejects very long URLs, so the quoted passage is capped.
const MAX_QUOTE = 800;

export function erratumUrl({ chapter = '', location = '', quote = '', url = '' } = {}) {
  const q = quote.length > MAX_QUOTE ? `${quote.slice(0, MAX_QUOTE)}…` : quote;
  const params = new URLSearchParams({ template: ERRATA_TEMPLATE });
  params.set('title', `[Erratum] ${[chapter.split(' · ')[0], location].filter(Boolean).join(' · ')}`);
  if (chapter) params.set('chapter', chapter);
  if (location) params.set('location', location);
  if (q) params.set('quote', q);
  if (url) params.set('url', url);
  return `https://github.com/${ERRATA_REPO}/issues/new?${params}`;
}

// "Ch. 4 · Motion Planning", or just the title for unnumbered front matter.
export const chapterLabel = (chapter, num) => (num ? `Ch. ${num} · ${chapter.title}` : chapter.title);
