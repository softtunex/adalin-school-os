# Demo videos

The demo videos are scripted: they're recorded and edited by code, so they can be remade whenever the product changes.

- **Full walkthrough** (`scripts/demo-video/full.ts`): 16 chapters, from creating a school to the Enterprise features, about 18 minutes. Every caption carries the cheapest plan that includes it (Free, Basic, Standard, Premium, Enterprise). It also produces one clip per chapter for social media.
- **Overview** (`scripts/demo-video/overview.ts`): about 2.5 minutes of highlights.

## Making them

1. `pnpm demo:server` seeds a clean Adalin College and Adalin Heights Schools on their own database (`.data/demo-video-pglite`), builds the app and serves it on port 3305. It never touches the demo school you click around in.
2. `pnpm demo:record-full` (or `pnpm demo:record` for the overview) signs everyone in off camera and records each scene. To redo some, name them: `pnpm demo:record-full c10-3 "Student life"`. A scene that fails is reported with a screenshot and the rest carry on.
3. `FFMPEG=<path to ffmpeg> pnpm demo:edit full` (or `overview`) cuts loading frames, frames phone scenes in a phone, adds captions, plan badges, chapter cards and title cards. It writes `.data/demo-video/<name>/adalin-schoolhub-<name>.mp4` (1080p, 30 fps, H.264, no sound) and, for the full walkthrough, `chapters/NN-*.mp4`.

## How it stays realistic

- **Demo clock.** The demo server runs on 08:30 Lagos time on the next school day (set another with `DEMO_NOW=2026-10-19T08:30:00+01:00`). The seeds, the server, the database's `now()` and the recording browser all use the same shift, so registers are open, greetings say "Good morning" and dates line up, whatever day you record.
- **Fresh data.** Restart the server before a final take; scenes change data (registers, payments, approvals). `--keep` restarts without reseeding, for redoing one scene.
- **No demo traces.** In the recording, test-mode notices are hidden, the server's address shows as `https://adalinschoolhub.com`, the test checkout is cut, and Google and Microsoft sign-in use placeholder apps so the options show (nothing signs in through them).
- `DEMO_PACE` stretches every hold (default 1.5).
- The Adalin admin console is never recorded: it's for Adalin staff, not schools.
- Never point the scripts at the live site.
