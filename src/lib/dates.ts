/*
 * How times read across the app: 12-hour clock in Lagos time, and plain words for
 * recent things. "Just now", "5 min ago", "Today, 2:09 pm", "Yesterday, 4:30 pm",
 * "Mon, 9:15 am", "12 Oct, 2:09 pm", "12 Oct 2025".
 */

const TZ = "Africa/Lagos";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const fullDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });

/** "2:09 pm" */
export function formatTime(d: Date) {
  return timeFmt.format(d).replace(/\s?([ap])\.?m\.?$/i, (_, x: string) => ` ${x.toLowerCase()}m`);
}

function daysBetween(a: Date, b: Date) {
  const day = (x: Date) => Date.parse(`${dayKeyFmt.format(x)}T00:00:00Z`);
  return Math.round((day(b) - day(a)) / 86_400_000);
}

/**
 * A moment, the way people say it. Pass `relative: false` in client components so the
 * server and browser render the same text ("5 min ago" can tick over between them).
 */
export function formatWhen(d: Date, opts: { now?: Date; relative?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (opts.relative !== false && mins >= 0 && mins < 60) return mins < 1 ? "Just now" : `${mins} min ago`;
  const days = daysBetween(d, now);
  if (days === 0) return `Today, ${formatTime(d)}`;
  if (days === 1) return `Yesterday, ${formatTime(d)}`;
  if (days > 1 && days < 7) return `${weekdayFmt.format(d)}, ${formatTime(d)}`;
  if (dayKeyFmt.format(d).slice(0, 4) === dayKeyFmt.format(now).slice(0, 4)) return `${dayMonthFmt.format(d)}, ${formatTime(d)}`;
  return fullDateFmt.format(d);
}

/** Compact, for inbox rows: "Just now", "5 min", "2:09 pm", "Yesterday", "Mon", "12 Oct". */
export function formatShort(d: Date, now = new Date()) {
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins >= 0 && mins < 1) return "Just now";
  if (mins >= 0 && mins < 60) return `${mins} min`;
  const days = daysBetween(d, now);
  if (days === 0) return formatTime(d);
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return weekdayFmt.format(d);
  if (dayKeyFmt.format(d).slice(0, 4) === dayKeyFmt.format(now).slice(0, 4)) return dayMonthFmt.format(d);
  return fullDateFmt.format(d);
}

/** A deadline: "Today, 8:00 am", "Tomorrow, 8:00 am", "Fri, 8:00 am", "12 Oct, 8:00 am". Past ones read like formatWhen. */
export function formatDue(d: Date, now = new Date()) {
  const ahead = daysBetween(now, d);
  if (ahead < 0) return formatWhen(d, { now, relative: false });
  if (ahead === 0) return `Today, ${formatTime(d)}`;
  if (ahead === 1) return `Tomorrow, ${formatTime(d)}`;
  if (ahead < 7) return `${weekdayFmt.format(d)}, ${formatTime(d)}`;
  return `${dayMonthFmt.format(d)}, ${formatTime(d)}`;
}
