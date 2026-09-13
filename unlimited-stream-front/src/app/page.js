"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const POLL_MS = 10000;

export default function Home() {
  const [streams, setStreams] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { streams } = await api.liveStreams();
        if (!cancelled) setStreams(streams);
      } catch {
        if (!cancelled) setStreams([]);
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl w-full px-4 py-8 flex-1">
      <h1 className="text-2xl font-bold mb-6">استریم‌های لایو</h1>

      {streams === null && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {streams?.length === 0 && (
        <p className="text-muted-foreground">در حال حاضر هیچ استریم لایوی وجود نداره.</p>
      )}

      {streams && streams.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {streams.map((s) => (
            <Link key={s.username} href={`/channel/${s.username}`}>
              <Card className="hover:border-primary transition-colors overflow-hidden py-0 gap-3">
                <div className="aspect-video bg-muted relative">
                  {s.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      بدون تامبنیل
                    </div>
                  )}
                  <Badge variant="destructive" className="absolute top-2 start-2">
                    لایو
                  </Badge>
                </div>
                <CardHeader className="pb-1">
                  <CardTitle className="truncate">{s.streamTitle || `پخش زنده ${s.username}`}</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm text-muted-foreground truncate">
                    {s.displayName || s.username} · {s.viewerCount} بیننده
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
