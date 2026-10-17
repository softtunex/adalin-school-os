# Performance

School OS has to work on the phones and connections Nigerian teachers and parents actually have. These are the budgets, how to measure them, and the latest results.

## Budgets

| What | Budget | Why |
| --- | --- | --- |
| JavaScript per core page (compressed) | under **175 KB** | React and Next.js alone ship about 140 KB to every page; our own code stays under 35 KB on top. |
| Usable on Fast 3G, first visit | under **10 s** | A teacher on a decent day. |
| Usable on Slow 3G, first visit | under **20 s** | A bad day, or a crowded mast. |
| Repeat visits | almost nothing downloaded | The offline service worker keeps the app's code on the phone. |
| Server, 500 schools at once | 95% of pages under 1.5 s, under 1% errors | The plan's load target. |

"Usable" means the page's code has downloaded and run, so taps work, not just that something appeared.

## Measuring

Against a production build (`pnpm build && pnpm start`, or a staging deployment):

```bash
BASE_URL=http://localhost:3005 npx tsx scripts/perf-3g.ts               # Fast 3G
PROFILE=slow BASE_URL=http://localhost:3005 npx tsx scripts/perf-3g.ts  # Slow 3G
```

It signs in as demo staff, then opens each core page in a fresh browser with nothing cached, on an emulated phone and connection, and fails if a page is over budget.

Load test (needs [k6](https://k6.io) and a staging copy, never the live site): see the header of `scripts/load/core.k6.js`.

## Latest results (17 October 2026, local production build)

| Page | JS (KB) | Fast 3G (s) | Slow 3G (s) |
| --- | ---: | ---: | ---: |
| Login | 159 | 3.3 | 10.7 |
| Teacher dashboard | 161 | 3.2 | 10.5 |
| Attendance | 157 | 3.2 | 10.5 |
| Results | 157 | 3.2 | 10.6 |
| Fees (bursar) | 163 | 3.3 | 11.0 |
| Parent sign-in | 159 | 3.1 | 10.5 |

All within budget. The load test is to be run against staging once it exists (Phase 9), as a laptop's single-connection database can't stand in for Neon.
