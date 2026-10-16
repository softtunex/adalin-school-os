import type { Tone } from "@/components/ui/display";

export const NOTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  returned: { label: "Returned", tone: "danger" },
};
