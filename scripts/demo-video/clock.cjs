/*
 * Demo clock: moves "now" by DEMO_CLOCK_OFFSET_MS (set by scripts/demo-server.ts so a recording
 * happens on a school-day morning) while letting time tick on as normal. Preloaded into the demo
 * server and its seed scripts with NODE_OPTIONS=--require, so the app, the database's now() and the
 * seeded data all agree. Demo recordings only; the live site never loads this.
 *
 * A Proxy over the real Date: only "now" changes; parse, UTC, the prototype and instanceof are untouched.
 */
const offset = Number(process.env.DEMO_CLOCK_OFFSET_MS ?? 0);
if (offset) {
  const RealDate = Date;
  const now = () => RealDate.now() + offset;
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [now()], newTarget),
    apply: () => new RealDate(now()).toString(),
    get: (target, prop, receiver) => (prop === "now" ? now : Reflect.get(target, prop, receiver)),
  });
}
