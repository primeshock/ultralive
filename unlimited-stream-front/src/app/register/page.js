"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { setUser } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("رمز عبور و تکرار آن یکسان نیستند");
      return;
    }

    setSubmitting(true);
    try {
      const { user } = await api.register(username, password);
      setUser(user);
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ساخت اکانت</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">نام کاربری</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_]+"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="email">ایمیل</Label>
                <Tooltip>
                  <TooltipTrigger
                    render={<Badge variant="secondary" className="cursor-default">به‌زودی</Badge>}
                  />
                  <TooltipContent>این قابلیت هنوز فعال نشده</TooltipContent>
                </Tooltip>
              </div>
              <Input id="email" type="email" placeholder="you@example.com" disabled />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">تکرار رمز عبور</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting}>
              {submitting ? "در حال ساخت اکانت..." : "ثبت‌نام"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
