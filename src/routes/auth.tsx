import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — SBAS" },
      { name: "description", content: "تسجيل دخول مدققي سلامة الغذاء إلى نظام تدقيق فروع سعودي." },
      { property: "og:title", content: "تسجيل الدخول — SBAS" },
      { property: "og:description", content: "الدخول إلى نظام تدقيق فروع سعودي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email({ message: "بريد إلكتروني غير صحيح" }).max(255),
  password: z.string().min(8, { message: "كلمة المرور 8 أحرف على الأقل" }).max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (mode: "signin" | "signup") => {
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          ...parsed.data,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim().slice(0, 100) },
          },
        });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        toast.success("تم إنشاء الحساب، تحقق من بريدك الإلكتروني لتأكيد الحساب");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl brand-banner text-2xl font-bold">
            S
          </span>
          <h1 className="mt-4 text-xl font-extrabold">نظام تدقيق فروع سعودي</h1>
          <p className="text-xs text-muted-foreground">Seoudi Branches Audit System</p>
        </div>

        <div className="surface-card p-5">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">دخول</TabsTrigger>
              <TabsTrigger value="signup">حساب جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button className="w-full" size="lg" disabled={loading} onClick={() => submit("signin")}>
                تسجيل الدخول
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">الاسم الكامل</Label>
                <Input id="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email2">البريد الإلكتروني</Label>
                <Input id="email2" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password2">كلمة المرور</Label>
                <Input
                  id="password2"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button className="w-full" size="lg" disabled={loading} onClick={() => submit("signup")}>
                إنشاء حساب
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                أول حساب يتم إنشاؤه يحصل على صلاحيات مدير النظام.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
