"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

function storedThemeIsDark() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("ultra-live-theme") === "dark";
  } catch {
    return false;
  }
}

export function SiteHeader() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isStudentStream = /^\/(channel|monitor)(\/|$)/.test(pathname || "");
  const [dark, setDark] = useState(storedThemeIsDark);
  const [brand, setBrand] = useState({ siteName: "Ultra Live", logoUrl: "" });

  useEffect(() => {
    const streamDark = isStudentStream || dark;
    document.documentElement.classList.toggle("dark", streamDark);
  }, [dark, isStudentStream]);

  useEffect(() => {
    api.site().then(setBrand).catch(() => {});
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem("ultra-live-theme", next ? "dark" : "light");
    } catch {
      // Keep the in-memory choice even when persistent storage is unavailable.
    }
    document.documentElement.classList.toggle("dark", next);
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setUser(null);
    router.push("/");
  }

  return (
    <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="font-bold text-lg flex items-center gap-2 min-w-0">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="h-8 w-auto max-w-[140px] object-contain bg-transparent" />
          ) : null}
          <span className="truncate">{brand.siteName || "Ultra Live"}</span>
        </Link>

        <nav className="flex items-center gap-2">
          {!isStudentStream && <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="تغییر تم">{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>}
          {loading ? null : user ? (
            <>
              {user.role === "owner" && (
                <Button variant="ghost" nativeButton={false} render={<Link href="/master" />}>
                  پنل مادر
                </Button>
              )}
              {(user.role === "admin" || user.role === "owner") && (
                <Button variant="ghost" nativeButton={false} render={<Link href="/admin" />}>
                  پنل ادمین
                </Button>
              )}
              {user.role === "teacher" && (
                <Button variant="ghost" nativeButton={false} render={<Link href="/dashboard" />}>
                  داشبورد
                </Button>
              )}
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
