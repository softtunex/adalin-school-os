import type { Tone } from "@/components/ui/display";

export const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "warning" },
  approved: { label: "Approved", tone: "blue" },
  paid: { label: "Paid", tone: "success" },
};
