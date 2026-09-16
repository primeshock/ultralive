"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Catches failures inside any page segment without replacing the whole app
// with Next's generic English fallback. The original error remains visible in
// the browser console for diagnosis, but is not shown to end users.
export default function AppError({ error, reset }) {
  useEffect(() => {
    console.error("[Ultra Live] page render failed", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold">بارگذاری این بخش با مشکل مواجه شد</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        اطلاعات شما از بین نرفته. دوباره تلاش کنید؛ اگر مشکل ادامه داشت، صفحه را تازه‌سازی کنید.
      </p>
      <Button type="button" onClick={reset}>تلاش دوباره</Button>
    </div>
  );
}
