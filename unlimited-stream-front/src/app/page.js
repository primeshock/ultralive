"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Institutional deployment: no public browsing of all classes (that used to
// list every live channel here). Staff get sent to their panel; anyone else
// (including a student who somehow lands here instead of their class link)
// just sees a plain notice — no list of other classes to poke at.
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.role === "owner") router.replace("/master");
    else if (user?.role === "admin") router.replace("/admin");
    else if (user?.role === "teacher") router.replace("/dashboard");
  }, [loading, user, router]);

  if (loading || user) {
    return <div className="flex-1 flex items-center justify-center">در حال بارگذاری...</div>;
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 text-center">
      <p className="text-muted-foreground">
        برای ورود به کلاس، از لینکی که در سایت مؤسسه در اختیارت گذاشته شده استفاده کن.
      </p>
    </div>
  );
}
