import type { ButtonHTMLAttributes, Ref } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "destructive-outline";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: "standard" | "compact";
  iconOnly?: boolean;
}

export function Button({
  variant = "secondary",
  size = "standard",
  iconOnly = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "sa-button",
    `sa-button--${variant}`,
    size === "compact" ? "sa-button--compact" : "",
    iconOnly ? "sa-button--icon-only" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return <button {...props} className={classes} type={type} />;
}
