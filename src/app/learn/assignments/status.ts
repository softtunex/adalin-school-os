import type { Tone } from "@/components/ui/display";
import type { StudentAssignmentStatus } from "@/lib/services/assignments";

export const HOMEWORK_STATUS: Record<StudentAssignmentStatus, { label: string; tone: Tone }> = {
  to_do: { label: "To do", tone: "brand" },
  overdue: { label: "Overdue", tone: "danger" },
  handed_in: { label: "Handed in", tone: "blue" },
  marked: { label: "Marked", tone: "success" },
  missed: { label: "Missed", tone: "neutral" },
};
