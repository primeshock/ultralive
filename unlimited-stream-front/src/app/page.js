"use client";

import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Home() {
  const [brand, setBrand] = useState({ siteName: "Ultra Live", logoUrl: "" });
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    api.site().then((nextBrand) => setBrand(nextBrand)).catch(() => {});
  }, []);

  return <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4 text-center"><div className="flex items-center gap-3 text-2xl font-bold">{brand.logoUrl && !logoFailed ? <img src={brand.logoUrl} alt="لوگو" onError={() => setLogoFailed(true)} className="h-14 w-14 rounded-xl object-contain" /> : <ImageOff className="size-10 text-muted-foreground" aria-hidden="true" />}<span>{brand.siteName || "Ultra Live"}</span></div><p className="text-muted-foreground">این راه به جایی نمی‌رسه</p></div>;
}
