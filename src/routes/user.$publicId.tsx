import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { ProfileDetails, type DetailsProfile } from "@/components/ProfileDetails";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/user/$publicId")({
  head: () => ({
    meta: [
      { title: "بروفايل مستخدم — voli" },
      { name: "description", content: "شاهد بروفايل المستخدم على voli: مستواه ومتابعينه وهداياه." },
      { property: "og:title", content: "بروفايل مستخدم — voli" },
      { property: "og:description", content: "بروفايل مستخدم على voli." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserPage,
});

function UserPage() {
  const { publicId } = Route.useParams();
  const router = useRouter();
  const { session, profile: me, ready } = useAccount();
  const [user, setUser] = useState<DetailsProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session) return;
    setLoaded(false);
    supabase.from("profiles").select("*").eq("public_id", Number(publicId)).maybeSingle()
      .then(({ data }) => { setUser((data as DetailsProfile | null) ?? null); setLoaded(true); });
  }, [publicId, session]);

  const isSelf = !!me && String(me.public_id) === publicId;

  return (
    <AppScreen navigation={false}>
      <ProfileDetails
        profile={user}
        userId={user?.auth_id}
        ready={ready && (!session || loaded)}
        signedIn={!!session}
        isSelf={isSelf}
        back={
          <Button variant="ghost" size="icon" aria-label="رجوع" onClick={() => router.history.back()} className="rounded-full bg-overlay text-on-media backdrop-blur">
            <ArrowRight className="size-5" />
          </Button>
        }
      />
      {user && !isSelf && (
        <div className="sticky bottom-0 bg-background/90 p-4 backdrop-blur">
          <Button asChild className="w-full rounded-full">
            <Link to="/chat/$publicId" params={{ publicId }}><MessageCircle className="size-4" /> مراسلة</Link>
          </Button>
        </div>
      )}
    </AppScreen>
  );
}
