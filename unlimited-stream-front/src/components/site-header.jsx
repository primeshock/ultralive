"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export function SiteHeader() {
  const { user, loading, setUser } = useAuth();
  const [site, setSite] = useState({ siteName: "Koosha Live", logoUrl: "", faviconUrl: "" });
  useEffect(() => { api.siteSettings().then(setSite).catch(() => {}); }, []);
  useEffect(() => { if (!site.faviconUrl) return; let link = document.querySelector("link[data-koosha-favicon]"); if (!link) { link = document.createElement("link"); link.rel = "icon"; link.dataset.kooshaFavicon = "1"; document.head.appendChild(link); } link.href = site.faviconUrl; }, [site.faviconUrl]);
  const router = useRouter();

  async function handleLogout() {
    await api.logout().catch(() => {});
    setUser(null);
    router.push("/");
  }

  return (
    <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="font-bold text-lg flex items-center gap-2">
          {site.logoUrl ? <img src={site.logoUrl} alt="" className="size-7 rounded object-contain" /> : null}
          {site.siteName || "Koosha Live"}
        </Link>

        <nav className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href={user.role === "owner" ? "/owner" : user.role === "admin" ? "/admin" : "/dashboard"} />}>
                {user.role === "owner" ? "Owner" : user.role === "admin" ? "پنل مدیریت" : "داشبورد"}
              </Button>
              <Avatar className="size-8">
                <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Button variant="outline" onClick={handleLogout}>
                خروج
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
                ورود
              </Button>
              <Button nativeButton={false} render={<Link href="/register" />}>
                ثبت‌نام
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
