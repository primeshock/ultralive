"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function AdminLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { setUser } = useAuth();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { user } = await api.login(username, password);
      setUser(user);
      if (["owner", "admin", "SUPER_OWNER", "ORGANIZATION_OWNER", "ADMIN_L1", "ADMIN_L2"].includes(user.role)) {
        router.replace("/admin");
      } else {
        router.replace("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="flex-1 flex items-center justify-center px-4 py-12"><Card className="w-full max-w-sm"><CardHeader><CardTitle>ورود مدیریت</CardTitle></CardHeader><CardContent><form onSubmit={handleSubmit} className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="username">نام کاربری</Label><Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></div><div className="flex flex-col gap-2"><Label htmlFor="password">رمز عبور</Label><div className="relative"><Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="pe-10" required /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 inset-e-0 flex items-center px-3 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "مخفی کردن رمز" : "نمایش رمز"} tabIndex={-1}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>{error && <p className="text-sm text-destructive">نام کاربری یا رمز عبور نادرست است.</p>}<Button type="submit" disabled={submitting}>{submitting ? "در حال ورود..." : "ورود"}</Button></form></CardContent></Card></div>;
}