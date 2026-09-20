"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ManagementPanel } from "@/components/management-panel";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

export default function AdminPage() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const allowed = user && ["admin", "owner"].includes(user.role);

  useEffect(() => {
    if (!loading && !allowed) router.replace("/");
  }, [allowed, loading, router]);

  if (loading || !allowed) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin" /></div>;
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    router.push("/");
  }

  return <div className="admin-shell min-h-full w-full"><ManagementPanel user={user} onLogout={logout} /></div>;
}
