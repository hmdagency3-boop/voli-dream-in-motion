import { cn } from "@/lib/utils";

/** Official Voli Helper picture: the brand "V" on the primary color, so it never depends on an uploaded file. */
export function VoliHelperAvatar({ className = "size-12" }: { className?: string }) {
  return (
    <span role="img" aria-label="لوجو Voli — إشعارات الإدارة"
      className={cn("grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background", className)}>
      <svg viewBox="0 0 24 24" className="size-1/2" aria-hidden="true">
        <path d="M6 6 L12 18 L18 6" className="fill-none stroke-current" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
