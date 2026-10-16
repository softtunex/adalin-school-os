"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/cn";
import { buttonClass, type Size, type Variant } from "./button-styles";

export { buttonClass };

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
