// Universities and courses teaching with the book. Drives the "Taught at" logo
// strip on the home page and the "Courses using the book" cards on the For
// Instructors page. Adding an adopter is one entry here (plus its logo under
// public/logos/; the logo should be a shield/seal-style mark that reads at ~2.5rem tall).
//
// `home: true` marks Stanford, where the book was written. It leads the home
// strip but is left out of the instructors-page list, because the "Build your
// course" section there already covers Stanford courses (src/data/slides.js).

export const ADOPTERS = [
  {
    institution: 'Stanford University',
    short: 'Stanford',
    logo: '/logos/stanford.svg',
    home: true,
    courses: [
      { code: 'AA 174A / AA 274A', title: 'Principles of Robot Autonomy I',
        url: 'https://stanfordasl.github.io/PoRA-I/aa174a_aut2526/' },
      { code: 'AA 203', title: 'Optimal and Learning-Based Control',
        url: 'https://stanfordasl.github.io/aa203/' },
    ],
  },
  {
    institution: 'Princeton University',
    short: 'Princeton',
    logo: '/logos/princeton.svg',
    courses: [
      { code: 'ROB 345 / 549', title: 'Introduction to Robotics',
        instructor: 'Anirudha Majumdar',
        url: 'https://irom-lab.princeton.edu/intro-to-robotics/' },
    ],
  },
  {
    institution: 'Cornell University',
    short: 'Cornell',
    logo: '/logos/cornell.svg',
    courses: [
      { code: 'CS 5757', title: 'Optimization Methods for Robotics',
        instructor: 'Preston Culbertson', term: 'Spring 2026',
        url: 'https://www.cs.cornell.edu/courses/cs5757/2026sp/' },
    ],
  },
];
