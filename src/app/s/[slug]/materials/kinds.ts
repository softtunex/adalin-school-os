import type { IconName } from "@/components/ui/icons";

export const KIND: Record<"file" | "link" | "note", { label: string; icon: IconName; hint: string }> = {
  file: { label: "File", icon: "file", hint: "Slides, PDFs, worksheets" },
  link: { label: "Link", icon: "link", hint: "YouTube, websites" },
  note: { label: "Note", icon: "edit", hint: "Typed notes" },
};
