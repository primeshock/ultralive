"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function MasterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return <div className="flex flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin" /></div>;
}
