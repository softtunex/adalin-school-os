import type { Tone } from "@/components/ui/display";

export const RESULT_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "In progress", tone: "warning" },
  reviewed: { label: "Reviewed", tone: "blue" },
  approved: { label: "Approved", tone: "violet" },
  published: { label: "Published", tone: "success" },
};
