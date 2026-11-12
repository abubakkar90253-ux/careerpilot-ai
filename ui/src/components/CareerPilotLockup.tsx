import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CareerPilotLockupProps = HTMLAttributes<HTMLDivElement> & {
  decorative?: boolean;
  title?: string;
};

export function CareerPilotLockup({
  decorative = false,
  title = "CareerPilot AI",
  className,
  ...rest
}: CareerPilotLockupProps) {
  return (
    <div
      {...rest}
      className={cn("inline-flex items-center gap-2 text-foreground", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
    >
      <svg className="size-7 shrink-0" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="17" fill="#102A43" />
        <circle cx="32" cy="32" r="20" stroke="#55D6BE" strokeWidth="4" />
        <path
          d="M21 39l9-10 7 6 10-13"
          stroke="#F8FAFC"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M40 22h7v7"
          stroke="#F8FAFC"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="whitespace-nowrap text-lg font-semibold tracking-tight">
        CareerPilot <span className="text-teal-500">AI</span>
      </span>
    </div>
  );
}
