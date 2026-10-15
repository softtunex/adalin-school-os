"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-[480px] flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-[26px] font-black tracking-[-0.02em]">Something went wrong</h1>
      <p className="text-[15.5px] text-muted">
        We couldn&apos;t load this page. Try again, and if it keeps happening, contact support{error.digest ? ` with code ${error.digest}` : ""}.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
