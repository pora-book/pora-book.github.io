// Lecture slide decks for instructors — organized by the lecture order of the
// Stanford courses the book grew out of (NOT by book chapter order).
//
// Files live under public/slides/<course>/lecture_<n>.{pdf,pptx} and are served
// from /slides/…. PDFs are checked in; PPTX links are placeholders pointing at
// the same naming scheme and go live as the source files are added to the repo.
//
// Titles mirror the course schedules at:
//   https://stanfordasl.github.io/aa174a/  (Principles of Robot Autonomy I)
//   https://stanfordasl.github.io/aa203/   (Optimal and Learning-Based Control)

const deck = (course, n, title, parts = null) => {
  const stems = parts
    ? parts.map((p) => `/slides/${course}/lecture_${n}_${p}`)
    : [`/slides/${course}/lecture_${n}`];
  return {
    n,
    title,
    pdf: stems.map((s) => `${s}.pdf`),
    pptx: stems.map((s) => `${s}.pptx`),
  };
};

export const COURSES = [
  {
    id: 'aa174a',
    code: 'Stanford AA174A / AA274A',
    title: 'Principles of Robot Autonomy I',
    url: 'https://stanfordasl.github.io/aa174a/',
    lectures: [
      deck('aa174a', 1, 'Course overview, intro to robotic systems and ROS'),
      deck('aa174a', 2, 'Fundamentals of ROS'),
      deck('aa174a', 3, 'State space dynamics — definitions and modeling'),
      deck('aa174a', 4, 'State space dynamics — computation and simulation'),
      deck('aa174a', 5, 'Trajectory optimization'),
      deck('aa174a', 6, 'Trajectory tracking & closed-loop control'),
      deck('aa174a', 7, 'Graph search algorithms'),
      deck('aa174a', 8, 'Sampling-based motion planning'),
      deck('aa174a', 9, 'Robotic sensors & introduction to computer vision'),
      deck('aa174a', 10, 'Camera models & coordinate frames'),
      deck('aa174a', 11, 'Image processing, feature detection, and feature description'),
      deck('aa174a', 12, 'Information extraction'),
      deck('aa174a', 13, 'Deep learning for computer vision'),
      deck('aa174a', 14, 'Intro to state estimation & filtering theory'),
      deck('aa174a', 15, 'Parametric filtering (KF and EKF)'),
      deck('aa174a', 16, 'Markov localization and EKF-localization'),
      deck('aa174a', 17, 'Multi-sensor perception & sensor fusion', ['p1', 'p2']),
      deck('aa174a', 18, 'Simultaneous localization and mapping (SLAM)'),
    ],
  },
  {
    id: 'aa203',
    code: 'Stanford AA203',
    title: 'Optimal and Learning-Based Control',
    url: 'https://stanfordasl.github.io/aa203/',
    lectures: [
      deck('aa203', 1, 'Course overview; intro to nonlinear optimization'),
      deck('aa203', 2, 'Optimization theory'),
      deck('aa203', 3, 'Calculus of variations'),
      deck('aa203', 4, 'Indirect methods for optimal control'),
      deck('aa203', 5, "Pontryagin's maximum principle, continuous-time LQR"),
      deck('aa203', 6, 'Direct methods (collocation, SCP)'),
      deck('aa203', 7, 'Dynamic programming (DP), discrete LQR'),
      deck('aa203', 8, 'Nonlinear LQR for tracking and trajectory generation (iLQR, DDP)'),
      deck('aa203', 9, 'Stochastic DP, value iteration, policy iteration'),
      deck('aa203', 10, 'HJB, HJI, and reachability analysis'),
      deck('aa203', 11, 'MPC I: introduction, persistent feasibility'),
      deck('aa203', 12, 'MPC II: persistent feasibility (cont’d), stability of MPC, and explicit MPC'),
      deck('aa203', 13, 'Intro to learning, system ID, adaptive control'),
      deck('aa203', 14, 'Intro to imitation learning and RL'),
      deck('aa203', 15, 'Imitation learning'),
      deck('aa203', 16, 'RL I: foundations of RL'),
      deck('aa203', 17, 'RL II: model-free RL — value-based methods'),
      deck('aa203', 18, 'RL III: model-free RL — policy optimization'),
      deck('aa203', 19, 'RL IV: model-based RL and conclusions'),
    ],
  },
];
