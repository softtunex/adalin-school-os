/**
 * Facts the legal pages state, kept in one place so the pages and the code that enforces them
 * (retention in src/lib/services/retention.ts) can't drift apart.
 */
export const RETENTION = [
  { what: "Signed-out and expired sessions", keep: "30 days after they expire" },
  { what: "Failed sign-in attempts", keep: "30 days" },
  { what: "Password reset links", keep: "7 days after they're used or expire" },
  { what: "Text of SMS and email messages sent", keep: "180 days (the record that a message was sent stays)" },
  { what: "In-app notifications", keep: "1 year" },
  { what: "Webhook delivery records", keep: "90 days" },
  { what: "Unfinished online payments", keep: "90 days" },
  { what: "School records (students, results, fees and the rest)", keep: "While the school uses School OS; deleted within 90 days of the account closing, after the school has had the chance to download everything" },
] as const;

export const PROCESSORS = [
  { name: "Neon", does: "Database hosting", where: "European Union" },
  { name: "Vercel", does: "Application hosting", where: "European Union and global edge network" },
  { name: "Resend", does: "Sending email", where: "United States" },
  { name: "Termii", does: "Sending SMS", where: "Nigeria" },
  { name: "Paystack", does: "Fee and subscription payments", where: "Nigeria" },
  { name: "Cloudinary", does: "Storing logos, photos and signatures", where: "United States" },
  { name: "Cloudflare", does: "Storing documents and learning materials", where: "Global" },
  { name: "Google and Microsoft", does: "Sign-in, only for people who choose it", where: "Global" },
] as const;
