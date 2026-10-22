import type { SVGProps } from "react";

export type IconName =
  | "agent"
  | "orchestrator"
  | "tool"
  | "memory"
  | "external"
  | "decision"
  | "check"
  | "alert"
  | "warning"
  | "info"
  | "lock"
  | "grip"
  | "plus"
  | "minus"
  | "fit"
  | "clock";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  title?: string;
}

function IconArtwork({ name }: Pick<IconProps, "name">) {
  switch (name) {
    case "agent":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="9" r="2.6" />
          <path d="M6.8 18.1c.8-2.4 2.7-3.7 5.2-3.7s4.4 1.3 5.2 3.7" />
        </>
      );
    case "orchestrator":
      return (
        <>
          <path d="M12 12 6 6m6 6 6-6m-6 6v7" />
          <circle cx="12" cy="12" r="2.4" />
          <circle cx="6" cy="6" r="1.6" />
          <circle cx="18" cy="6" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </>
      );
    case "tool":
      return (
        <>
          <path d="M14.3 6.2a4.5 4.5 0 0 0-5.8 5.8l-4.8 4.8a1.8 1.8 0 0 0 2.5 2.5l4.8-4.8a4.5 4.5 0 0 0 5.8-5.8l-2.7 2.7-2.5-2.5 2.7-2.7Z" />
        </>
      );
    case "memory":
      return (
        <>
          <ellipse cx="12" cy="6" rx="7.5" ry="3" />
          <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
          <path d="M4.8 9c.8 1 3.7 1.8 7.2 1.8s6.4-.8 7.2-1.8" />
        </>
      );
    case "external":
      return (
        <>
          <path d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4" />
          <path d="M10 14 19 5m-6 0h6v6" />
        </>
      );
    case "decision":
      return (
        <>
          <path d="M5 5v5c0 2 2 3 4 3h6c2 0 4 1 4 3v3M5 10c0 2 2 3 4 3m-4-3V5m4 8c-2 0-4 1-4 3v3" />
          <circle cx="5" cy="4" r="1.5" />
          <circle cx="19" cy="20" r="1.5" />
          <circle cx="5" cy="20" r="1.5" />
        </>
      );
    case "check":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m7.5 12.2 3 3 6-6.2" />
        </>
      );
    case "alert":
    case "warning":
      return (
        <>
          <path d="m12 3 9 17H3L12 3Z" />
          <path d="M12 9v5m0 3h.01" />
        </>
      );
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5m0-8h.01" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
        </>
      );
    case "grip":
      return (
        <>
          {[6, 12, 18].flatMap((x) => [7, 12, 17].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}
        </>
      );
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "minus":
      return <path d="M5 12h14" />;
    case "fit":
      return (
        <>
          <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" />
          <path d="M8 8h8v8H8z" />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.2 2" />
        </>
      );
  }
}

export function Icon({ name, size = 16, title, ...svgProps }: IconProps) {
  return (
    <svg
      {...svgProps}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "grip" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <IconArtwork name={name} />
    </svg>
  );
}
