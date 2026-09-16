"use client";

import { use, useEffect, useState } from "react";
import { LiveKitPlayer } from "@/components/livekit-player";
import { api } from "@/lib/api";
import { LoadingIndicator } from "@/components/loading-indicator";

export default function MonitorPage({ params }) {
  const { token } = use(params);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.livekitMonitorToken(token).then(setConnection).catch((err) => setError(err.message));
  }, [token]);

  if (error) return <main className="min-h-screen bg-black text-white flex items-center justify-center">{error}</main>;
  if (!connection) return <main className="min-h-screen bg-black text-white flex items-center justify-center"><LoadingIndicator label="در حال اتصال به LiveKit..." className="text-white" /></main>;

  return (
    <main className="min-h-screen bg-black p-4 flex items-center justify-center">
      <div className="w-full max-w-6xl aspect-video">
        <LiveKitPlayer
          channel={connection.channel}
          connection={connection}
          className="w-full h-full"
        />
      </div>
    </main>
  );
}
