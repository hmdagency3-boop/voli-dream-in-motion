import { Link } from "@tanstack/react-router";
import { Home, MessageCircle, User } from "lucide-react";

const cls = "flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-muted-foreground";

export function BottomNav() {
  return (
    <footer className="relative z-10 shrink-0 bg-transparent px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-around rounded-full border bg-card/90 px-3 py-2 shadow-soft backdrop-blur">
        <Link to="/" className={cls} activeProps={{ className: "text-primary" }} activeOptions={{ exact: true }}>
          <Home className="size-5" />الرئيسية
        </Link>
        <Link to="/chat" className={cls} activeProps={{ className: "text-primary" }}>
          <MessageCircle className="size-5" />دردشة
        </Link>
        <Link to="/me" className={cls} activeProps={{ className: "text-primary" }}>
          <User className="size-5" />أنا
        </Link>
      </div>
    </footer>
  );
}
