import type { SVGProps } from "react";
import { cn } from "../lib/utils";

export function AnimatedPaperclipIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("careerpilot-loading-icon", className)}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M12 2.5a9.5 9.5 0 1 0 9.5 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        className="careerpilot-loading-icon-path"
        d="m5.5 15.5 4-4 3 2.5 5.5-6m-4 0H18v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full-page loading state with the CareerPilot mark. */
export function PaperclipLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex min-h-dvh w-full items-center justify-center", className)}
    >
      <AnimatedPaperclipIcon className="h-24 w-24 text-muted-foreground" />
      <span className="sr-only">Loading CareerPilot AI…</span>
    </div>
  );
}
