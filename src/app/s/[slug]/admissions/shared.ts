import type { Tone } from "@/components/ui/display";
import type { ApplicantStatus } from "@/lib/db/schema";

export const STATUS_TONE: Record<ApplicantStatus, Tone> = {
  applied: "neutral",
  exam: "blue",
  interview: "violet",
  offered: "brand",
  accepted: "success",
  enrolled: "success",
  rejected: "danger",
  withdrawn: "neutral",
};
