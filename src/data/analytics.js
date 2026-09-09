// Analytics — one cookieless GoatCounter beacon, wired into BaseLayout so it
// covers every page on the site (home, table of contents, all 22 chapters,
// exercises, lectures, instructors).
//
// GoatCounter is free for non-commercial use, sets no cookies and stores no
// personal data, which is why the site carries no consent banner. It counts
// pageviews plus the handful of outbound "clicks that matter" marked up with
// `data-goatcounter-click` — see EVENTS below.
//
// TO GO LIVE: create a site at https://www.goatcounter.com, then paste its
// count endpoint here. Until this is a non-empty string BaseLayout renders no
// script at all, so the site ships with zero tracking by default.
export const GOATCOUNTER = 'https://danielegammelli.goatcounter.com/count';

// Event-name scheme for the outbound links we instrument. Names are stable and
// slash-separated so they group in the GoatCounter dashboard the way paths do:
//
//   arxiv                                  → clicks through to the open-access PDF
//   colab/<chapter>/<notebook>             → notebook opened in Google Colab
//   source/<chapter>/<notebook>            → notebook source opened on GitHub
//   github/exercises                       → the pora-exercises repo
//   slides/<course>/lecture_<n>.pdf|.pptx  → lecture deck downloaded
//   youtube/<course>/<n>                   → lecture recording opened
//
// A notebook's `path` from exercises.json ("ch01/exercises/foo.ipynb") is the
// natural key; drop the redundant folder and extension so the event reads
// "colab/ch01/foo".
export const nbEvent = (kind, nb) =>
  `${kind}/${nb.path.replace('/exercises/', '/').replace(/\.ipynb$/, '')}`;
