import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ChecklistManager } from "@/components/admin/ChecklistManager";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "الإدارة — SBAS" },
      { name: "description", content: "إدارة الفروع، المدققين، وقوائم الفحص وأنواع التدقيق." },
      { property: "og:title", content: "الإدارة — SBAS" },
      { property: "og:description", content: "لوحة إدارة نظام تدقيق فروع سعودي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin } = useSession();
  const queryClient = useQueryClient();
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-data"],
    queryFn: async () => {
      const [branches, profiles] = await Promise.all([
        supabase.from("branches").select("*").order("name_ar"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      return { branches: branches.data ?? [], profiles: profiles.data ?? [] };
    },
  });

  if (!isAdmin) {
    return (
      <AppShell title="الإدارة">
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          هذه الصفحة متاحة لمديري النظام فقط.
        </div>
      </AppShell>
    );
  }

  const addBranch = async () => {
    if (!branchName.trim() || !branchCode.trim()) {
      toast.error("أدخل اسم الفرع والكود");
      return;
    }
    const { error } = await supabase
      .from("branches")
      .insert({ name_ar: branchName.trim().slice(0, 120), code: branchCode.trim().slice(0, 40) });
    if (error) {
      toast.error("تعذر إضافة الفرع");
      return;
    }
    setBranchName("");
    setBranchCode("");
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  };

  return (
    <AppShell title="الإدارة" subtitle="الفروع، المدققون، وقوائم الفحص">
      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist">قائمة الفحص</TabsTrigger>
          <TabsTrigger value="branches">الفروع</TabsTrigger>
          <TabsTrigger value="users">المستخدمون</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="pt-4">
          <ChecklistManager />
        </TabsContent>

        <TabsContent value="branches" className="space-y-3 pt-4">
          <div className="surface-card flex flex-wrap items-end gap-2 p-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bname">اسم الفرع</Label>
              <Input id="bname" value={branchName} onChange={(event) => setBranchName(event.target.value)} />
            </div>
            <div className="w-32 space-y-1.5">
              <Label htmlFor="bcode">الكود</Label>
              <Input id="bcode" value={branchCode} onChange={(event) => setBranchCode(event.target.value)} />
            </div>
            <Button onClick={addBranch}>إضافة</Button>
          </div>

          <div className="grid gap-2">
            {data?.branches.map((branch) => (
              <div key={branch.id} className="surface-card flex items-center gap-3 p-3 text-sm">
                <span className="font-semibold">{branch.name_ar}</span>
                <span className="text-muted-foreground">{branch.code}</span>
                <div className="mr-auto flex items-center gap-3">
                  <Switch
                    checked={branch.active}
                    onCheckedChange={async (value) => {
                      await supabase.from("branches").update({ active: value }).eq("id", branch.id);
                      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
                    }}
                  />
                  <button
                    aria-label="حذف الفرع"
                    onClick={async () => {
                      await supabase.from("branches").delete().eq("id", branch.id);
                      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-2 pt-4">
          {data?.profiles.map((profile) => (
            <div key={profile.id} className="surface-card flex items-center gap-3 p-3 text-sm">
              <span className="font-semibold">{profile.full_name || "—"}</span>
              <span className="text-muted-foreground" dir="ltr">{profile.email}</span>
              <Switch
                className="mr-auto"
                checked={profile.active}
                onCheckedChange={async (value) => {
                  await supabase.from("profiles").update({ active: value }).eq("id", profile.id);
                  queryClient.invalidateQueries({ queryKey: ["admin-data"] });
                }}
              />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
