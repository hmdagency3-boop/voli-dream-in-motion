import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { ProfileDetails } from "@/components/ProfileDetails";
import { useAccount } from "@/hooks/use-account";
export const Route = createFileRoute("/me_/details")({
  head: () => ({
    meta: [
      { title: "بيانات الحساب — voli" },
      { name: "description", content: "بيانات حسابك الكاملة على voli: مستواك، متابعينك، وكالتك وهداياك." },
      { property: "og:title", content: "بيانات الحساب — voli" },
      { property: "og:description", content: "بيانات حسابك الكاملة على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DetailsPage,
});

function DetailsPage() {
  const { session, profile, ready } = useAccount();
  return (
    <AppScreen navigation={false}>
      <ProfileDetails profile={profile} userId={session?.user.id} ready={ready} signedIn={!!session} isSelf
        back={<Button asChild variant="ghost" size="icon" aria-label="رجوع" className="rounded-full bg-overlay text-on-media backdrop-blur"><Link to="/me"><ArrowRight className="size-5" /></Link></Button>} />
    </AppScreen>
  );
}
