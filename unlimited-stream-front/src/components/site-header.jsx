"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

function storedThemeIsDark() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("koosha-theme") === "dark";
  } catch {
    return false;
  }
}

export function SiteHeader() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const [dark, setDark] = useState(storedThemeIsDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem("koosha-theme", next ? "dark" : "light");
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
        <Link href="/" className="font-bold text-lg">
          Koosha Live
        </Link>

        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="تغییر تم">{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
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
