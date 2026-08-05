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
      { title: "New Audit — SBAS" },
      { name: "description", content: "Create a new audit: pick the branch, audit type, date and auditor." },
      { property: "og:title", content: "New Audit — SBAS" },
      { property: "og:description", content: "Start a new Seoudi branch audit." },
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
        supabase.from("audit_types").select("id, name_ar, name_en").eq("active", true).order("name_en"),
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
      toast.error("Select a branch, audit type and auditor");
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
      toast.error(error?.message ?? "Unable to create the audit");
      return;
    }
    navigate({ to: "/audits/$id", params: { id: created.id } });
  };

  return (
    <AppShell title="New Audit" subtitle="Visit details">
      <div className="surface-card mx-auto max-w-lg space-y-4 p-5">
        <div className="space-y-1.5">
          <Label>Audit Type</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger><SelectValue placeholder="Select audit type" /></SelectTrigger>
            <SelectContent>
              {data?.types.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name_en || type.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {data?.branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  <span dir="rtl">{branch.name_ar}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manager">Branch Manager</Label>
          <Input id="manager" value={manager} maxLength={120} onChange={(event) => setManager(event.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Auditor</Label>
          <Select value={auditorId} onValueChange={setAuditorId}>
            <SelectTrigger><SelectValue placeholder="Select auditor" /></SelectTrigger>
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
          <Label htmlFor="date">Audit Date</Label>
          <Input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>

        <Button className="w-full" size="lg" disabled={saving} onClick={create}>
          Start Audit
        </Button>
      </div>
    </AppShell>
  );
}
