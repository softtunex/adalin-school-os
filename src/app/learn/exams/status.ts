import type { Tone } from "@/components/ui/display";

export const STUDENT_EXAM: Record<"upcoming" | "open" | "in_progress" | "done" | "missed", { label: string; tone: Tone }> = {
  upcoming: { label: "Coming up", tone: "blue" },
  open: { label: "Open now", tone: "brand" },
  in_progress: { label: "In progress", tone: "warning" },
  done: { label: "Done", tone: "success" },
  missed: { label: "Missed", tone: "neutral" },
};
