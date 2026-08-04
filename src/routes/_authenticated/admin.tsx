import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "الإدارة — SBAS" },
      { name: "description", content: "إدارة الفروع، المدققين، واستيراد قوائم الفحص من ملفات Excel." },
      { property: "og:title", content: "الإدارة — SBAS" },
      { property: "og:description", content: "لوحة إدارة نظام تدقيق فروع سعودي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of Object.keys(row)) {
    const normalized = key.trim().toLowerCase();
    if (keys.some((candidate) => normalized === candidate || normalized.includes(candidate))) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
  }
  return "";
};

function AdminPage() {
  const { isAdmin } = useSession();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeCode, setNewTypeCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");


  const { data } = useQuery({
    queryKey: ["admin-data"],
    queryFn: async () => {
      const [branches, types, profiles] = await Promise.all([
        supabase.from("branches").select("*").order("name_ar"),
        supabase.from("audit_types").select("*").order("name_ar"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      return { branches: branches.data ?? [], types: types.data ?? [], profiles: profiles.data ?? [] };
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

  const purgeChecklist = async () => {
    const { data: oldQuestions } = await supabase.from("questions").select("id").eq("audit_type_id", typeId);
    const ids = (oldQuestions ?? []).map((q) => q.id);
    if (ids.length) {
      const { count } = await supabase
        .from("audit_answers")
        .select("id", { count: "exact", head: true })
        .in("question_id", ids);
      if (count && count > 0) {
        // الأسئلة مستخدمة في تدقيقات سابقة: نعطلها بدل حذفها للحفاظ على التقارير
        await supabase.from("questions").update({ active: false }).eq("audit_type_id", typeId);
        await supabase.from("sections").update({ active: false }).eq("audit_type_id", typeId);
        return "archived";
      }
      await supabase.from("questions").delete().eq("audit_type_id", typeId);
    }
    const { data: oldSections } = await supabase.from("sections").select("id").eq("audit_type_id", typeId);
    const sectionIds = (oldSections ?? []).map((s) => s.id);
    if (sectionIds.length) await supabase.from("headers").delete().in("section_id", sectionIds);
    await supabase.from("sections").delete().eq("audit_type_id", typeId);
    return "deleted";
  };

  const addAuditType = async () => {
    if (!newTypeName.trim() || !newTypeCode.trim()) {
      toast.error("أدخل اسم النوع والكود");
      return;
    }
    const { data: created, error } = await supabase
      .from("audit_types")
      .insert({
        name_ar: newTypeName.trim().slice(0, 120),
        name_en: newTypeName.trim().slice(0, 120),
        code: newTypeCode.trim().slice(0, 40),
      })
      .select("id")
      .single();
    if (error || !created) {
      toast.error("تعذر إضافة نوع التدقيق");
      return;
    }
    setNewTypeName("");
    setNewTypeCode("");
    setTypeId(created.id);
    toast.success("تمت إضافة نوع التدقيق");
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  };

  const importChecklist = async (file: File) => {
    if (!typeId) {
      toast.error("اختر نوع التدقيق أولاً");
      return;
    }
    setImporting(true);
    try {
      let purgeResult: string | null = null;
      if (replaceExisting) purgeResult = await purgeChecklist();

      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const sectionCache = new Map<string, string>();
      const headerCache = new Map<string, string>();
      let sectionOrder = 0;
      let headerOrder = 0;
      let itemOrder = 0;
      let imported = 0;



      for (const row of rows) {
        const sectionName = pick(row, ["section", "القسم"]);
        const questionText = pick(row, ["question", "السؤال", "البند", "item text"]);
        if (!sectionName || !questionText) continue;

        let sectionId = sectionCache.get(sectionName);
        if (!sectionId) {
          const isDelivery = /delivery|توصيل/i.test(sectionName);
          const { data: created, error } = await supabase
            .from("sections")
            .insert({
              audit_type_id: typeId,
              name_ar: sectionName,
              order_index: sectionOrder++,
              is_delivery: isDelivery,
            })
            .select("id")
            .single();
          if (error || !created) throw error ?? new Error("section");
          sectionId = created.id;
          sectionCache.set(sectionName, sectionId);
        }

        const headerName = pick(row, ["header", "العنوان", "المجموعة"]);
        let headerId: string | null = null;
        if (headerName) {
          const key = `${sectionId}|${headerName}`;
          headerId = headerCache.get(key) ?? null;
          if (!headerId) {
            const { data: created } = await supabase
              .from("headers")
              .insert({ section_id: sectionId, label_ar: headerName, order_index: headerOrder++ })
              .select("id")
              .single();
            headerId = created?.id ?? null;
            if (headerId) headerCache.set(key, headerId);
          }
        }

        const maxScoreRaw = Number(pick(row, ["max", "الدرجة", "score"]));
        const { error: questionError } = await supabase.from("questions").insert({
          audit_type_id: typeId,
          section_id: sectionId,
          header_id: headerId,
          item_id: pick(row, ["item id", "id", "الرقم", "كود"]) || String(itemOrder + 1),
          text_ar: questionText,
          max_score: Number.isFinite(maxScoreRaw) && maxScoreRaw > 0 ? maxScoreRaw : 4,
          item_order: itemOrder++,
        });
        if (questionError) throw questionError;
        imported += 1;
      }

      toast.success(
        purgeResult === "archived"
          ? `تم أرشفة الأسئلة القديمة (مستخدمة في تدقيقات سابقة) واستيراد ${imported} سؤالاً`
          : `تم استيراد ${imported} سؤالاً`,
      );

      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر استيراد الملف");
    } finally {
      setImporting(false);
    }
  };

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
          <div className="surface-card space-y-4 p-5">
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
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Upload className="size-4" /> {importing ? "جارٍ الاستيراد…" : "استيراد ملف Excel"}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importChecklist(file);
                  event.target.value = "";
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              يتوقع الملف أعمدة: القسم (Section)، العنوان (Header)، رقم البند (Item ID)، السؤال (Question)، الدرجة القصوى (Max Score).
            </p>
          </div>
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
