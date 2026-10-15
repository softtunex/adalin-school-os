"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-chunk border-2 font-extrabold uppercase tracking-[0.05em] transition-[transform,box-shadow,background-color] duration-75 select-none disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-[4px] disabled:active:translate-y-0 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand border-brand text-white shadow-[0_4px_0_var(--brand-deep)] hover:brightness-105 active:shadow-none disabled:active:shadow-[0_4px_0_var(--brand-deep)]",
  secondary:
    "bg-canvas border-line-strong text-blue shadow-[0_4px_0_var(--line-strong)] hover:bg-paper active:shadow-none disabled:active:shadow-[0_4px_0_var(--line-strong)]",
  danger:
    "bg-danger border-danger text-white shadow-[0_4px_0_var(--danger-deep)] hover:brightness-105 active:shadow-none",
  success:
    "bg-success border-success text-white shadow-[0_4px_0_var(--success-deep)] hover:brightness-105 active:shadow-none",
  ghost: "bg-transparent border-transparent text-muted hover:text-ink hover:bg-sunken active:translate-y-0",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[12.5px]",
  md: "h-11 px-4 text-[13.5px]",
  lg: "h-[52px] px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  ...props
}: Omit<ButtonProps, "type"> & { pendingText?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
