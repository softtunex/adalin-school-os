import type { Tone } from "@/components/ui/display";
import type { ExamState } from "@/lib/services/cbt";

export const EXAM_STATE: Record<ExamState, { label: string; tone: Tone }> = {
  open: { label: "Open now", tone: "success" },
  scheduled: { label: "Scheduled", tone: "blue" },
  closed: { label: "Closed", tone: "neutral" },
  draft: { label: "Draft", tone: "warning" },
};
