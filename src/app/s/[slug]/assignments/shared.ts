import type { Tone } from "@/components/ui/display";

export function assignmentState(a: { status: string; dueAt: Date }): { label: string; tone: Tone } {
  if (a.status === "draft") return { label: "Draft", tone: "neutral" };
  if (a.status === "closed") return { label: "Closed", tone: "neutral" };
  if (a.dueAt.getTime() < Date.now()) return { label: "Past due", tone: "warning" };
  return { label: "Open", tone: "success" };
}
