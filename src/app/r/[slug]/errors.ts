/** Fixed messages for the public result checker. The URL only ever carries a code, never text. */
export const CHECK_ERRORS: Record<string, string> = {
  missing: "Enter the admission number and the PIN.",
  pin: "That PIN isn't valid. Check the digits on your card.",
  student: "We couldn't find a student with that admission number.",
  other_student: "This PIN has already been used for a different student.",
  expired: "This PIN has used up all its checks.",
  unpublished: "Results for this term haven't been published yet. Please check back later.",
  none: "There are no results for this student in that term.",
  owing: "This result is being held until the term's school fees are paid. Please contact the school's bursar.",
  busy: "Too many attempts. Please wait 15 minutes and try again.",
  generic: "We couldn't check that result. Please try again.",
};

export function codeFor(message: string): string {
  if (/PIN isn't valid/.test(message)) return "pin";
  if (/admission number/.test(message)) return "student";
  if (/different student/.test(message)) return "other_student";
  if (/expired/.test(message)) return "expired";
  if (/published/.test(message)) return "unpublished";
  if (/no results|aren't available/.test(message)) return "none";
  if (/being held/.test(message)) return "owing";
  if (/Too many/.test(message)) return "busy";
  return "generic";
}
