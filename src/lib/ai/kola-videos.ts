/*
 * Tutorial videos for Kola to point to, per page (same keys as KOLA_GUIDE). Made by
 * scripts/demo-video/kola-videos.mts from the uploaded series; don't edit by hand. Each link opens the
 * scene that shows the page. The videos are unlisted on YouTube (Episode 1 is public).
 */

export type KolaVideo = { title: string; url: string };

export const KOLA_SERIES =
  "https://www.youtube.com/playlist?list=PLGcZ6pPBMjbA";

export const KOLA_VIDEOS: Record<string, KolaVideo[]> = {
  "": [
    {
      title: "Episode 2: Today",
      url: "https://youtu.be/SFjHZsUjAlA",
    },
    {
      title: "Episode 1: Your first steps",
      url: "https://youtu.be/xK23EBNAojg?t=126",
    },
    {
      title: "Episode 2: Term summary",
      url: "https://youtu.be/SFjHZsUjAlA?t=68",
    },
  ],
  "/academics": [
    {
      title: "Episode 7: Assessment & grading",
      url: "https://youtu.be/L0WAqjrzC38?t=256",
    },
    {
      title: "Episode 7: Classes",
      url: "https://youtu.be/L0WAqjrzC38",
    },
    {
      title: "Episode 7: Sessions & terms",
      url: "https://youtu.be/L0WAqjrzC38?t=196",
    },
  ],
  "/admissions": [
    {
      title: "Episode 5: Setting up admissions",
      url: "https://youtu.be/_cpbAmdLP0Q?t=77",
    },
    {
      title: "Episode 10: Applicants",
      url: "https://youtu.be/SQ2DzNMzCrY?t=46",
    },
    {
      title: "Episode 10: How parents apply",
      url: "https://youtu.be/SQ2DzNMzCrY",
    },
  ],
  "/announcements": [
    {
      title: "Episode 20: Announcements",
      url: "https://youtu.be/u7NTImpIYl4",
    },
  ],
  "/assignments": [
    {
      title: "Episode 15: Setting homework",
      url: "https://youtu.be/r2NveJUC9TQ",
    },
    {
      title: "Episode 15: Marking",
      url: "https://youtu.be/r2NveJUC9TQ?t=82",
    },
  ],
  "/attendance": [
    {
      title: "Episode 11: Teachers",
      url: "https://youtu.be/rEPk_MB63mM",
    },
    {
      title: "Episode 11: The whole school",
      url: "https://youtu.be/rEPk_MB63mM?t=45",
    },
  ],
  "/audit": [
    {
      title: "Episode 25: The audit log",
      url: "https://youtu.be/Ixg2h37L5vM?t=82",
    },
  ],
  "/calendar": [
    {
      title: "Episode 20: The calendar",
      url: "https://youtu.be/u7NTImpIYl4?t=55",
    },
  ],
  "/cbt": [
    {
      title: "Episode 16: The question bank",
      url: "https://youtu.be/hO1Tv3wry2s",
    },
    {
      title: "Episode 16: Building a test",
      url: "https://youtu.be/hO1Tv3wry2s?t=61",
    },
    {
      title: "Episode 16: Results and marking",
      url: "https://youtu.be/hO1Tv3wry2s?t=144",
    },
  ],
  "/discipline": [
    {
      title: "Episode 18: Behaviour",
      url: "https://youtu.be/9SkcjdB84A4",
    },
  ],
  "/documents": [
    {
      title: "Episode 5: Setting up documents",
      url: "https://youtu.be/_cpbAmdLP0Q?t=312",
    },
    {
      title: "Episode 24: The register and templates",
      url: "https://youtu.be/POmUBaoOUdM?t=136",
    },
    {
      title: "Episode 24: ID cards",
      url: "https://youtu.be/POmUBaoOUdM",
    },
  ],
  "/expenses": [
    {
      title: "Episode 22: Recording an expense",
      url: "https://youtu.be/apbQvH4tvr8",
    },
    {
      title: "Episode 22: Approving, and the income statement",
      url: "https://youtu.be/apbQvH4tvr8?t=35",
    },
  ],
  "/fees": [
    {
      title: "Episode 21: An invoice, and a cash payment",
      url: "https://youtu.be/Hy--hlmAsio?t=64",
    },
    {
      title: "Episode 21: Discounts and scholarships",
      url: "https://youtu.be/Hy--hlmAsio?t=218",
    },
    {
      title: "Episode 21: Fees overview",
      url: "https://youtu.be/Hy--hlmAsio",
    },
  ],
  "/hostel": [
    {
      title: "Episode 5: Setting up sick bay, transport and boarding",
      url: "https://youtu.be/_cpbAmdLP0Q?t=267",
    },
    {
      title: "Episode 19: Boarding",
      url: "https://youtu.be/KtrjGXrs9pI?t=49",
    },
  ],
  "/hr": [
    {
      title: "Episode 5: Setting up staff & HR",
      url: "https://youtu.be/_cpbAmdLP0Q?t=132",
    },
    {
      title: "Episode 23: Staff",
      url: "https://youtu.be/nIcxw4rlpwU",
    },
    {
      title: "Episode 23: The principal",
      url: "https://youtu.be/nIcxw4rlpwU?t=31",
    },
  ],
  "/inventory": [
    {
      title: "Episode 5: Setting up library and inventory",
      url: "https://youtu.be/_cpbAmdLP0Q?t=230",
    },
    {
      title: "Episode 25: The store",
      url: "https://youtu.be/Ixg2h37L5vM",
    },
    {
      title: "Episode 25: Signed out, and history",
      url: "https://youtu.be/Ixg2h37L5vM?t=68",
    },
  ],
  "/lesson-notes": [
    {
      title: "Episode 15: Lesson notes",
      url: "https://youtu.be/r2NveJUC9TQ?t=121",
    },
    {
      title: "Episode 15: Approving lesson notes",
      url: "https://youtu.be/r2NveJUC9TQ?t=178",
    },
  ],
  "/library": [
    {
      title: "Episode 5: Setting up library and inventory",
      url: "https://youtu.be/_cpbAmdLP0Q?t=230",
    },
    {
      title: "Episode 18: The library",
      url: "https://youtu.be/9SkcjdB84A4?t=75",
    },
  ],
  "/materials": [
    {
      title: "Episode 17: Sharing materials",
      url: "https://youtu.be/PrO0QzQ9vpA",
    },
  ],
  "/messages": [
    {
      title: "Episode 20: Messages",
      url: "https://youtu.be/u7NTImpIYl4?t=98",
    },
    {
      title: "Episode 20: Messages",
      url: "https://youtu.be/u7NTImpIYl4?t=98",
    },
  ],
  "/payroll": [
    {
      title: "Episode 5: Setting up payroll",
      url: "https://youtu.be/_cpbAmdLP0Q?t=177",
    },
    {
      title: "Episode 22: Preparing payroll",
      url: "https://youtu.be/apbQvH4tvr8?t=62",
    },
    {
      title: "Episode 22: Approving payroll",
      url: "https://youtu.be/apbQvH4tvr8?t=107",
    },
  ],
  "/results": [
    {
      title: "Episode 13: The class teacher",
      url: "https://youtu.be/9UQ3rG1ty7k?t=60",
    },
    {
      title: "Episode 14: Result PINs",
      url: "https://youtu.be/J1iXf0z3cY4",
    },
    {
      title: "Episode 13: Approve and publish",
      url: "https://youtu.be/9UQ3rG1ty7k?t=133",
    },
  ],
  "/roles": [
    {
      title: "Episode 8: Roles & permissions",
      url: "https://youtu.be/715r5C4pI6o?t=145",
    },
  ],
  "/settings": [
    {
      title: "Episode 5: Messaging",
      url: "https://youtu.be/_cpbAmdLP0Q",
    },
    {
      title: "Episode 5: Admissions",
      url: "https://youtu.be/_cpbAmdLP0Q?t=77",
    },
    {
      title: "Episode 5: Staff & HR",
      url: "https://youtu.be/_cpbAmdLP0Q?t=132",
    },
  ],
  "/sick-bay": [
    {
      title: "Episode 19: The sick bay",
      url: "https://youtu.be/KtrjGXrs9pI?t=116",
    },
  ],
  "/staff": [
    {
      title: "Episode 8: Staff",
      url: "https://youtu.be/715r5C4pI6o",
    },
    {
      title: "Episode 8: Invite staff",
      url: "https://youtu.be/715r5C4pI6o?t=77",
    },
  ],
  "/students": [
    {
      title: "Episode 9: A student's profile",
      url: "https://youtu.be/fagFr8SgDNw?t=123",
    },
    {
      title: "Episode 9: Add a student",
      url: "https://youtu.be/fagFr8SgDNw?t=63",
    },
    {
      title: "Episode 9: The student list",
      url: "https://youtu.be/fagFr8SgDNw",
    },
  ],
  "/timetable": [
    {
      title: "Episode 12: Bell schedule",
      url: "https://youtu.be/yYB8i2VA2ak",
    },
    {
      title: "Episode 12: A class's timetable",
      url: "https://youtu.be/yYB8i2VA2ak?t=42",
    },
    {
      title: "Episode 12: Teachers' timetables",
      url: "https://youtu.be/yYB8i2VA2ak?t=94",
    },
  ],
  "/transport": [
    {
      title: "Episode 5: Setting up sick bay, transport and boarding",
      url: "https://youtu.be/_cpbAmdLP0Q?t=267",
    },
    {
      title: "Episode 19: Transport",
      url: "https://youtu.be/KtrjGXrs9pI",
    },
  ],
};

export const KOLA_PARENT_VIDEOS: KolaVideo[] = [
  {
    title: "Episode 27: Parents",
    url: "https://youtu.be/fKFGpPxRJpg",
  },
  {
    title: "Episode 20: Parents",
    url: "https://youtu.be/u7NTImpIYl4?t=51",
  },
];
