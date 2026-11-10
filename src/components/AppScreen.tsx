import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";

/** footer: a bar that stays under the scrolling content (above the bottom navigation when both are shown). */
export function AppScreen({ children, navigation = true, background, footer }: { children: ReactNode; navigation?: boolean; background?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-muted md:p-8">
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-background md:rounded-[2.5rem] md:border md:shadow-soft">
        {background && <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">{background}</div>}
        <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 [scrollbar-width:thin]">
          {children}
        </main>
        {footer && <div className="relative z-10 shrink-0">{footer}</div>}
        {navigation && <BottomNav />}
      </div>
    </div>
  );
}