"use client";

import { useEffect, useState } from "react";
import { Building2, LogIn, LogOut, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

export function OrganizationManagement({ activeOrganization, onContextChange }) {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", slug: "", ownerUsername: "", ownerPassword: "" });

  async function loadOrganizations() {
    setLoading(true);
    setError("");
    try {
      setOrganizations(await api.organizations());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // The initial request owns its loading lifecycle and refreshes the server-backed list.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadOrganizations(); }, []);

  async function createOrganization(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.createOrganization({ ...form, slug: `org-${Date.now()}` });
      setForm({ name: "", slug: "", ownerUsername: "", ownerPassword: "" });
      setMessage("سازمان با موفقیت ساخته شد.");
      await loadOrganizations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function enterOrganization(organization) {
    setError("");
    try {
      const result = await api.enterOrganization(organization._id);
      onContextChange(result.organization);
    } catch (err) {
      setError(err.message);
    }
  }

  async function exitOrganization() {
    setError("");
    try {
      await api.exitOrganization();
      onContextChange(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeStatus(organization) {
    setError("");
    try {
      const updated = await api.updateOrganization(organization._id, { status: organization.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
      setOrganizations((current) => current.map((item) => item._id === updated._id ? { ...item, ...updated } : item));
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteOrganization(organization) {
    if (!window.confirm(`سازمان «${organization.name}» حذف شود؟`)) return;
    setError("");
    try {
      await api.deleteOrganization(organization._id);
      setOrganizations((current) => current.filter((item) => item._id !== organization._id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      {activeOrganization ? (
        <Card className="border-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3"><Building2 className="size-5" /><div><p className="font-semibold">در پنل سازمانی هستید</p><p className="text-sm text-muted-foreground">سازمان: {activeOrganization.name}</p></div></div>
            <Button variant="outline" onClick={exitOrganization}><LogOut className="ml-2 size-4" />خروج از سازمان</Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>سازمان‌ها</CardTitle><Button variant="outline" size="sm" onClick={loadOrganizations} disabled={loading}><RefreshCw className="ml-2 size-4" />به‌روزرسانی</Button></CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {message && <p className="mb-4 text-sm text-emerald-600">{message}</p>}
          {loading ? <p className="text-sm text-muted-foreground">در حال دریافت سازمان‌ها...</p> : organizations.length === 0 ? <p className="text-sm text-muted-foreground">هنوز سازمانی ساخته نشده است.</p> : <div className="space-y-3">{organizations.map((organization) => <div key={organization._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><p className="font-semibold">{organization.name}</p><p className="text-sm text-muted-foreground">مالک: {organization.ownerId?.displayName || organization.ownerId?.username || "-"} · {formatDate(organization.createdAt)}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-3 py-1 text-xs">{organization.status}</span><Button size="sm" onClick={() => enterOrganization(organization)} disabled={organization.status !== "ACTIVE"}><LogIn className="ml-2 size-4" />ورود به پنل</Button><Button size="sm" variant="outline" onClick={() => changeStatus(organization)}>{organization.status === "ACTIVE" ? "تعلیق" : "فعال‌سازی"}</Button><Button size="sm" variant="destructive" onClick={() => deleteOrganization(organization)}>حذف</Button></div></div>)}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ساخت سازمان</CardTitle></CardHeader>
        <CardContent><form onSubmit={createOrganization} className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="org-name">نام سازمان</Label><Input id="org-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div><div className="space-y-2"><Label htmlFor="org-owner">نام کاربری مالک</Label><Input id="org-owner" dir="ltr" value={form.ownerUsername} onChange={(event) => setForm({ ...form, ownerUsername: event.target.value })} pattern="[a-zA-Z0-9_]{3,24}" required /></div><div className="space-y-2"><Label htmlFor="org-password">رمز مالک</Label><Input id="org-password" type="password" minLength={8} value={form.ownerPassword} onChange={(event) => setForm({ ...form, ownerPassword: event.target.value })} required /></div><div className="flex items-end sm:col-span-2"><Button type="submit" disabled={saving}><Plus className="ml-2 size-4" />{saving ? "در حال ساخت..." : "ساخت سازمان"}</Button></div></form></CardContent>
      </Card>
    </div>
  );
}
