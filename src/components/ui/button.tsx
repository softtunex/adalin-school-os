"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost" | "success" | "dark";
type Size = "sm" | "md" | "lg" | "xl";

// Duolingo-style "pressable" buttons: a solid bottom edge that the button sinks into on press.
const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-chunk border-2 font-bold transition-[transform,box-shadow,background-color,border-color] duration-75 active:translate-y-[3px] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0";

const variants: Record<Variant, string> = {
  primary: "border-brand bg-brand text-white shadow-[0_3px_0_var(--brand-deep)] hover:bg-[#ff6d1c] active:shadow-none",
  secondary: "border-line-strong bg-canvas text-ink shadow-[0_3px_0_var(--line-strong)] hover:bg-paper active:shadow-none",
  outline: "border-line-strong bg-canvas text-blue shadow-[0_3px_0_var(--line-strong)] hover:bg-paper active:shadow-none",
  danger: "border-danger bg-danger text-white shadow-[0_3px_0_var(--danger-deep)] hover:brightness-105 active:shadow-none",
  success: "border-success bg-success text-white shadow-[0_3px_0_var(--success-deep)] hover:brightness-105 active:shadow-none",
  dark: "border-white/10 bg-white/10 text-white hover:bg-white/15 active:translate-y-0",
  ghost: "border-transparent bg-transparent text-body hover:bg-sunken hover:text-ink active:translate-y-0",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 fs-13.5",
  md: "h-11 px-4 fs-14.5",
  lg: "h-12 px-5 fs-15",
  xl: "h-14 px-8 fs-15 uppercase tracking-[0.06em]",
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

export function IconButton({ label, className, children, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("relative grid size-10 place-items-center rounded-full text-body transition-colors hover:bg-sunken hover:text-ink", className)}
      {...props}
    >
      {children}
    </button>
  );
}
