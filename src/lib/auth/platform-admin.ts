/**
 * Who gets the Adalin admin console: users flagged in the database (the demo data), and on the live
 * site anyone whose email is in PLATFORM_ADMIN_EMAILS (comma-separated, set in Vercel). Removing an
 * email from the list takes the access away at their next page load.
 */
export function isPlatformAdmin(user: { email: string | null; isPlatformAdmin: boolean }) {
  if (user.isPlatformAdmin) return true;
  const listed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!user.email && listed.includes(user.email.toLowerCase());
}
