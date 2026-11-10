import logoUrl from "@/assets/voli-mascot-logo.png";
const logo = { url: logoUrl };

export function VoliLogo({ className = "" }: { className?: string }) {
  return <img src={logo.url} alt="Voli" width={1024} height={1024} draggable={false} className={`object-contain ${className}`} />;
}