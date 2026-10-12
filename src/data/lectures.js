// Lecture recordings, organized by the Stanford courses the book grew out of
// (NOT by book chapter order) — the sibling of src/data/slides.js.
//
// Recordings are published on the official Stanford Online YouTube channel,
// which does not permit third-party embedding, so every lecture links out to
// YouTube rather than playing in place.
//
// Thumbnails are hotlinked from i.ytimg.com. `hqdefault.jpg` is used because it
// always exists for a public video (unlike `maxresdefault.jpg`); it is 4:3 with
// letterbox bars, which the tile crops back to 16:9 with `object-fit: cover`.
// Until a video is public the request 404s and the tile falls back to its own
// designed poster — see .lec-thumb in src/pages/lectures/index.astro.
//
// A course with `status: 'coming'` renders as an inert "Coming soon!" card and
// gets no lecture section; adding its `lectures` and flipping `status` to
// 'available' is all that's needed to light it up.
//
// AA174A's lectures are not listed here by hand: Stanford Online is uploading
// them gradually, so scripts/build-lectures-manifest.mjs pulls the playlist into
// lectures-aa174a.json before every CI build (and on a daily schedule). New
// uploads therefore appear on their own; numbering follows playlist order.

import aa174aPlaylist from './lectures-aa174a.json';

const lec = (n, title, yt) => ({
  n,
  title,
  yt,
  url: `https://youtu.be/${yt}`,
  thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
});

// Optional polish for the auto-fetched AA174A titles, keyed by YouTube id.
// Anything not listed here shows the YouTube title (minus the course prefix).
const AA174A_TITLES = {
  Lgt5ONBtFI0: 'Course Overview and Mobile Robot Kinematics',
  hFCIZjVkSaw: 'Motion Planning: Graph Search Methods',
  AN4jXyWwV7Q: 'Motion Planning: Sampling-Based Methods',
  emb_KF3OSu0: 'Sensors and Introduction to Computer Vision',
};

export const LECTURE_COURSES = [
  {
    id: 'aa203',
    code: 'Stanford AA203',
    title: 'Optimal and Learning-Based Control',
    url: 'https://stanfordasl.github.io/aa203/',
    status: 'available',
    lectures: [
      lec(1, 'Course Overview and Intro to Nonlinear Optimization', 'Au2stLALZew'),
      lec(2, 'Optimization Theory', 'FbkNYklySak'),
      lec(3, 'Calculus of Variations', 'duZJ2_ajLso'),
      lec(4, 'Indirect Methods for Optimal Control', '7rejaoMWviw'),
      lec(5, 'Pontryagin’s Minimum Principle and Computational Methods', 'R4_fHzTo0IM'),
      lec(6, 'Direct Methods for Optimal Control', 'zX8raxUa2DE'),
      lec(7, 'Dynamic Programming and Discrete-Time LQR', 'hy-e9g4nugE'),
      lec(8, 'Nonlinearity: Tracking LQR, Iterative LQR, Differential Dynamic Programming', '1YdgSwEtf_s'),
      lec(9, 'Stochastic Dynamic Programming, Value Iteration, and Policy Iteration', 'C9mLpI8Td9g'),
      lec(10, 'Hamilton–Jacobi–Bellman, Hamilton–Jacobi–Isaacs, and Reachability Analysis', 'Fl5EjGhQjgs'),
      lec(11, 'Introduction to Model Predictive Control', '3_gxaB_Pp3k'),
      lec(12, 'Persistent Feasibility of MPC, Stability, and Explicit MPC', '8Elrw30y0tg'),
      lec(13, 'Intro to Learning, System Identification and Adaptive Control', 'RtJSHiqOdgQ'),
      lec(14, 'Intro to Imitation Learning and Reinforcement Learning', '7YdOx-ih0II'),
      lec(15, 'Imitation Learning', 'udHX5Auj7ik'),
      lec(16, 'Fundamentals of Reinforcement Learning', 'cqPbt3OfRK4'),
      lec(17, 'Model-free Reinforcement Learning: Value-based Methods', 'zanXSI7zSws'),
      lec(18, 'Model-free Reinforcement Learning: Policy Optimization', 'a1g9U_5zO54'),
      lec(19, 'Model-based Reinforcement Learning and Conclusions', 'ZXMThMHFD_w'),
    ],
  },
  {
    id: 'aa174a',
    code: 'Stanford AA174A / AA274A',
    title: 'Principles of Robot Autonomy I',
    url: 'https://stanfordasl.github.io/PoRA-I/aa174a_aut2526/',
    status: 'available',
    lectures: aa174aPlaylist.videos.map((v, i) =>
      lec(i + 1, AA174A_TITLES[v.yt] ?? v.title, v.yt),
    ),
  },
];

export const availableCourses = () =>
  LECTURE_COURSES.filter((c) => c.status === 'available');
