"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { readAllNotificationsAction } from "../actions";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => readAllNotificationsAction())}>
      {pending ? "Marking…" : "Mark all as read"}
    </Button>
  );
}
