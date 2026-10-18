# Demo video

The overview video is scripted: it is recorded and edited by code, so it can be re-made in minutes whenever the product changes.

## Making it

1. `pnpm demo:server` seeds a clean Adalin College on its own database (`.data/demo-video-pglite`), builds the app and serves it on port 3305. It never touches the demo school you click around in.
2. `pnpm demo:record` signs everyone in off camera and records each scene (`scripts/demo-video/overview.ts`). Record one scene again with `pnpm demo:record 06-parent`, but restart the server first if the scene changes data (a register, a payment).
3. `FFMPEG=<path to ffmpeg> pnpm demo:edit` cuts loading frames, frames phone scenes in a phone, adds captions and title cards, and writes `.data/demo-video/overview/adalin-schoolhub-overview.mp4` (1080p, 30 fps, H.264, no sound).

## Rules

- **Record on a weekday, in the daytime.** The seed leaves today's registers open for the teacher scene, and the dashboard shows the time and "Good morning".
- **Restart the server before every final take**, so the data is fresh.
- `DEMO_PACE` stretches every hold (default 1.5). Raise it for a slower video.
- The demo server runs payments and parent sign-in codes in test mode. The recording hides the test-mode notice and cuts the test checkout; never point the scripts at the live site.
- The Adalin admin console is never recorded: it's for Adalin staff, not schools.
