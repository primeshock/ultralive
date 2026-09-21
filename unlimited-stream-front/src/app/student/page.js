"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function StudentPortalPage() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  async function load() { try { setError(""); setClasses(await api.studentClasses()); } catch (err) { setError(err.message); } }
  useEffect(() => { if (!loading && (!user || !["STUDENT", "student"].includes(user.role))) router.replace("/login"); }, [loading, user, router]);
  useEffect(() => { if (!user || !["STUDENT", "student"].includes(user.role)) return undefined; const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [user]);
  async function logout() { await api.logout(); setUser(null); router.replace("/login"); }
  if (loading || !user || !["STUDENT", "student"].includes(user.role)) return <div className="flex flex-1 items-center justify-center">در حال بارگذاری...</div>;
  return <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">پرتال دانش‌آموز</p><h1 className="mt-1 text-2xl font-bold">کلاس‌های من</h1></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="size-4" />تازه‌سازی</Button><Button variant="ghost" size="sm" onClick={() => void logout()}><LogOut className="size-4" />خروج</Button></div></div>{error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}{classes.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{classes.map(({ enrollmentId, class: item }) => <Card key={enrollmentId}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="size-4" />{item?.title || item?.displayName || item?.slug}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{item?.description || "کلاس اختصاصی شما"}</p><div className="flex items-center justify-between"><Badge variant={item?.visibility === "public" ? "default" : "secondary"}>{item?.visibility === "public" ? "عمومی" : "خصوصی"}</Badge><Button size="sm" onClick={() => router.push(`/channel/${item.slug}`)}>ورود به کلاس</Button></div></CardContent></Card>)}</div> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">هنوز کلاسی برای شما اختصاص داده نشده است.</CardContent></Card>}</div>;
}
