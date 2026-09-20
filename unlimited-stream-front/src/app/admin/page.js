"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ManagementPanel } from "@/components/management-panel";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { OrganizationManagement } from "@/components/organization-management";

export default function AdminPage() {
  const { user, loading, setUser, activeOrganization, setActiveOrganization } = useAuth();
  const router = useRouter();
  const allowed = user && ["admin", "owner", "SUPER_OWNER", "ORGANIZATION_OWNER", "ADMIN_L1", "ADMIN_L2"].includes(user.role);

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

  return <div className="admin-shell min-h-full w-full space-y-6"><div className="mx-auto max-w-6xl px-4 pt-6">{user.role === "SUPER_OWNER" && <OrganizationManagement activeOrganization={activeOrganization} onContextChange={setActiveOrganization} />}</div><ManagementPanel user={user} onLogout={logout} /></div>;
}
