/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Avatar } from "@/components/ui/display";

/** The school's own name and logo, in place of ours, on its own web address. */
export function SchoolMark({ name, logoUrl, href = "/login" }: { name: string; logoUrl: string | null; href?: string }) {
  return (
    <Link href={href} className="inline-flex min-w-0 items-center gap-2.5">
      {logoUrl ? <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-chunk object-contain" /> : <Avatar name={name} size={40} />}
      <span className="truncate fs-18 font-extrabold tracking-[-0.01em] text-ink">{name}</span>
    </Link>
  );
}
