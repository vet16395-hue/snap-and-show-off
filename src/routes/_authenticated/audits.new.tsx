import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/audits/new")({
  head: () => ({
    meta: [
      { title: "تدقيق جديد — SBAS" },
      { name: "description", content: "إنشاء تدقيق جديد: اختر الفرع، نوع التدقيق، التاريخ والمدقق." },
      { property: "og:title", content: "تدقيق جديد — SBAS" },
      { property: "og:description", content: "إنشاء تدقيق جديد لأحد فروع سعودي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewAudit,
});

function NewAudit() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [branchId, setBranchId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [auditorId, setAuditorId] = useState(user?.id ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manager, setManager] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["new-audit-options"],
    queryFn: async () => {
      const [branches, types, auditors] = await Promise.all([
        supabase.from("branches").select("id, name_ar, code").eq("active", true).order("name_ar"),
        supabase.from("audit_types").select("id, name_ar").eq("active", true).order("name_ar"),
        supabase.from("profiles").select("id, full_name, email").eq("active", true).order("full_name"),
      ]);
      return {
        branches: branches.data ?? [],
        types: types.data ?? [],
        auditors: auditors.data ?? [],
      };
    },
  });

  const create = async () => {
    if (!branchId || !typeId || !auditorId) {
      toast.error("اختر الفرع ونوع التدقيق والمدقق");
      return;
    }
    setSaving(true);
    const { data: created, error } = await supabase
      .from("audits")
      .insert({
        branch_id: branchId,
        audit_type_id: typeId,
        auditor_id: auditorId,
        audit_date: date,
        branch_manager: manager.trim().slice(0, 120) || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !created) {
      toast.error(error?.message ?? "تعذر إنشاء التدقيق");
      return;
    }
    navigate({ to: "/audits/$id", params: { id: created.id } });
  };

  return (
    <AppShell title="تدقيق جديد" subtitle="بيانات الزيارة">
      <div className="surface-card mx-auto max-w-lg space-y-4 p-5">
        <div className="space-y-1.5">
          <Label>الفرع</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>
              {data?.branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>{branch.name_ar}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>نوع التدقيق</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
            <SelectContent>
              {data?.types.map((type) => (
                <SelectItem key={type.id} value={type.id}>{type.name_ar}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>المدقق</Label>
          <Select value={auditorId} onValueChange={setAuditorId}>
            <SelectTrigger><SelectValue placeholder="اختر المدقق" /></SelectTrigger>
            <SelectContent>
              {data?.auditors.map((auditor) => (
                <SelectItem key={auditor.id} value={auditor.id}>
                  {auditor.full_name || auditor.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date">تاريخ التدقيق</Label>
          <Input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manager">مدير الفرع</Label>
          <Input id="manager" value={manager} maxLength={120} onChange={(event) => setManager(event.target.value)} />
        </div>

        <Button className="w-full" size="lg" disabled={saving} onClick={create}>
          بدء التدقيق
        </Button>
      </div>
    </AppShell>
  );
}
