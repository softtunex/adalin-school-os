import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-chunk border-2 border-line bg-canvas px-3.5 text-[15px] text-ink placeholder:text-muted transition-colors hover:border-line-strong focus:border-blue focus:outline-none aria-[invalid=true]:border-danger disabled:bg-sunken disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-3", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-12 appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10", className)} style={{ backgroundImage: "var(--select-arrow)" }} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[14px] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13.5px] font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-chunk border-2 border-line p-3 hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand-wash", className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" {...props} />
      <span className="flex flex-col">
        <span className="text-[14.5px] font-bold text-ink">{label}</span>
        {description ? <span className="text-[13.5px] text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
