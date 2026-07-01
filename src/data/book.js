// Canonical PoRA book structure — the single source of truth for chapter
// ordering, titles, parts, LaTeX source-file mapping, and exercise mapping.
// Derived from tex/combined.tex in StanfordASL/PoRA.
//
// Notes:
//  - `source` is the file under tex/source/ (numbers are offset from book
//    chapter numbers because some chapters were merged upstream).
//  - `exercises` is the folder in StanfordASL/pora-exercises, which uses BOOK
//    chapter numbers. `null` means no exercises exist yet.
//  - `status: 'published'` gates which chapters appear; upstream draft chapters
//    (ROS, Formal Methods, Manipulation, appendices) are omitted until ready.

export const PARTS = [
  { id: 'front', title: 'Getting Started' },
  { id: 'part-1', title: 'Part I · Robot Motion Planning and Control' },
  { id: 'part-2', title: 'Part II · Robot Perception' },
  { id: 'part-3', title: 'Part III · Robot Localization and Mapping' },
  { id: 'part-4', title: 'Part IV · Robot Decision Making' },
  { id: 'back', title: 'Closing' },
];

export const CHAPTERS = [
  { number: -1, label: null, title: 'Preface', slug: 'preface',
    source: 'preface', part: 'front', exercises: null, status: 'published' },
  { number: 0, label: 'ch:software-note', title: 'Robot Autonomy Software', slug: 'software',
    source: 'note_on_software', part: 'front', exercises: null, status: 'published' },

  { number: 1, label: 'ch:model-dyn', title: 'Modeling Robot Dynamics', slug: 'modeling-robot-dynamics',
    source: 'ch01', part: 'part-1', exercises: 'ch01', status: 'published' },
  { number: 2, label: 'ch:openloop', title: 'Open-Loop Control & Trajectory Optimization', slug: 'open-loop-control',
    source: 'ch02', part: 'part-1', exercises: 'ch02', status: 'published' },
  { number: 3, label: 'ch:closedloop', title: 'Closed-Loop Control & Trajectory Tracking', slug: 'closed-loop-control',
    source: 'ch03', part: 'part-1', exercises: 'ch03', status: 'published' },
  { number: 4, label: 'ch:motion-planning', title: 'Motion Planning', slug: 'motion-planning',
    source: 'ch04', part: 'part-1', exercises: 'ch04', status: 'published' },

  { number: 5, label: 'ch:sensors', title: 'Introduction to Robot Sensors', slug: 'robot-sensors',
    source: 'ch06', part: 'part-2', exercises: null, status: 'published' },
  { number: 6, label: 'ch:cameras', title: 'Camera Models and Calibration', slug: 'camera-models',
    source: 'ch07', part: 'part-2', exercises: 'ch06', status: 'published' },
  { number: 7, label: 'ch:stereo-vision', title: 'Stereo Vision and Structure From Motion', slug: 'stereo-vision',
    source: 'ch08', part: 'part-2', exercises: null, status: 'published' },
  { number: 8, label: 'ch:classical_perception', title: 'Classical Methods for Perception', slug: 'classical-perception',
    source: 'ch09_10merged', part: 'part-2', exercises: 'ch08', status: 'published' },
  { number: 9, label: 'ch:vision-networks', title: 'Deep Learning Architectures for Perception', slug: 'deep-learning-perception',
    source: 'ch11', part: 'part-2', exercises: 'ch09', status: 'published' },
  { number: 10, label: 'ch:object-detection', title: 'Object Detection and Recognition', slug: 'object-detection',
    source: 'ch12', part: 'part-2', exercises: 'ch10', status: 'published' },

  { number: 11, label: 'ch:intro-to-localization', title: 'Introduction to Localization and Filtering', slug: 'localization-filtering',
    source: 'ch13', part: 'part-3', exercises: 'ch11', status: 'published' },
  { number: 12, label: 'ch:approximate-filters', title: 'Approximate Filters for State Estimation', slug: 'approximate-filters',
    source: 'ch14', part: 'part-3', exercises: 'ch12', status: 'published' },
  { number: 13, label: 'ch:robot-localization', title: 'Robot Localization', slug: 'robot-localization',
    source: 'ch15', part: 'part-3', exercises: 'ch13', status: 'published' },
  { number: 14, label: 'ch:slam', title: 'Simultaneous Localization and Mapping (SLAM)', slug: 'slam',
    source: 'ch16', part: 'part-3', exercises: 'ch14', status: 'published' },
  { number: 15, label: 'ch:sensor-fusion', title: 'Sensor Fusion and Object Tracking', slug: 'sensor-fusion',
    source: 'ch17', part: 'part-3', exercises: 'ch15', status: 'published' },

  { number: 16, label: 'ch:state-machines', title: 'Finite State Machines', slug: 'finite-state-machines',
    source: 'ch18', part: 'part-4', exercises: null, status: 'published' },
  { number: 17, label: 'ch:decision-making', title: 'Sequential Decision Making and Dynamic Programming', slug: 'decision-making',
    source: 'ch19', part: 'part-4', exercises: 'ch17', status: 'published' },
  { number: 18, label: 'ch:rl', title: 'Reinforcement Learning', slug: 'reinforcement-learning',
    source: 'ch20', part: 'part-4', exercises: 'ch18', status: 'published' },
  { number: 19, label: 'ch:imitation', title: 'Imitation Learning', slug: 'imitation-learning',
    source: 'ch21', part: 'part-4', exercises: null, status: 'published' },

  { number: 20, label: 'ch:prospects', title: 'Prospects', slug: 'prospects',
    source: 'conclusion', part: 'back', exercises: null, status: 'published' },
];

export const publishedChapters = () => CHAPTERS.filter((c) => c.status === 'published');

export const chaptersByPart = (partId) =>
  publishedChapters().filter((c) => c.part === partId);

export const displayNumber = (c) => (c.number >= 1 && c.number <= 19 ? String(c.number) : null);
