import { cn } from "@/lib/utils";

/** Scalloped "V" mark shown beside the Voli Helper name: the official management account. */
export function VoliHelperBadge({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="حساب إدارة رسمي"
      className={cn("size-4 shrink-0", className)}
    >
      <path
        d="M12.0 1.0 A 3.53 3.53 0 0 1 17.5 2.47 A 3.53 3.53 0 0 1 21.53 6.5 A 3.53 3.53 0 0 1 23.0 12.0 A 3.53 3.53 0 0 1 21.53 17.5 A 3.53 3.53 0 0 1 17.5 21.53 A 3.53 3.53 0 0 1 12.0 23.0 A 3.53 3.53 0 0 1 6.5 21.53 A 3.53 3.53 0 0 1 2.47 17.5 A 3.53 3.53 0 0 1 1.0 12.0 A 3.53 3.53 0 0 1 2.47 6.5 A 3.53 3.53 0 0 1 6.5 2.47 Z"
        className="fill-primary"
      />
      <path
        d="M8.2 8.2 L12 15.8 L15.8 8.2"
        className="fill-none stroke-primary-foreground"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
