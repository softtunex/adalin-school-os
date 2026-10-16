import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-chunk border border-line-strong bg-canvas px-3.5 fs-15 text-ink placeholder:text-muted transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--line-strong)_60%,var(--muted))] focus:border-blue focus:shadow-[0_0_0_3px_var(--blue-wash)] focus:outline-none aria-[invalid=true]:border-danger disabled:bg-sunken disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(control, "h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10", className)}
      style={{ backgroundImage: "var(--select-arrow)" }}
      {...props}
    >
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
      <label htmlFor={htmlFor} className="fs-14 font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="fs-13.5 font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="fs-13.5 text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-chunk border border-line-strong p-3 transition-colors hover:bg-paper has-[:checked]:border-brand has-[:checked]:bg-brand-wash",
        className,
      )}
    >
      <input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-[var(--brand)]" {...props} />
      <span className="flex flex-col">
        <span className="fs-14.5 font-medium text-ink">{label}</span>
        {description ? <span className="fs-13.5 text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
