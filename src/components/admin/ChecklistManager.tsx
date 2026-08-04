import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ChevronDown, ChevronUp, Plus, Save, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** يقرأ قيمة عمود من صف Excel: مطابقة تامة أولاً ثم مطابقة جزئية، مع استبعاد أعمدة محددة. */
const pick = (row: Record<string, unknown>, keys: string[], exclude: string[] = []) => {
  const entries = Object.keys(row).map((key) => ({ key, norm: key.trim().toLowerCase() }));
  const allowed = entries.filter(({ norm }) => !exclude.some((bad) => norm.includes(bad)));
  const value = (key: string) => {
    const raw = row[key];
    return raw === undefined || raw === null ? "" : String(raw).trim();
  };
  for (const candidate of keys) {
    const exact = allowed.find(({ norm }) => norm === candidate);
    if (exact && value(exact.key)) return value(exact.key);
  }
  for (const candidate of keys) {
    const partial = allowed.find(({ norm }) => norm.includes(candidate));
    if (partial && value(partial.key)) return value(partial.key);
  }
  return "";
};

const ID_EXCLUDE = ["رقم", "كود", "item id", "code", "no."];

export function ChecklistManager() {
  const queryClient = useQueryClient();
  const [typeId, setTypeId] = useState("");
  const [importing, setImporting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newHeader, setNewHeader] = useState<Record<string, string>>({});
  const [newQuestion, setNewQuestion] = useState<Record<string, string>>({});
  const [openSection, setOpenSection] = useState<string | null>(null);

  const { data: types } = useQuery({
    queryKey: ["audit-types"],
    queryFn: async () => (await supabase.from("audit_types").select("*").order("name_ar")).data ?? [],
  });

  const { data: tree } = useQuery({
    queryKey: ["checklist", typeId],
    enabled: Boolean(typeId),
    queryFn: async () => {
      const [sections, questions] = await Promise.all([
        supabase.from("sections").select("*").eq("audit_type_id", typeId).order("order_index"),
        supabase.from("questions").select("*").eq("audit_type_id", typeId).order("item_order"),
      ]);
      const sectionIds = (sections.data ?? []).map((section) => section.id);
      const headers = sectionIds.length
        ? (await supabase.from("headers").select("*").in("section_id", sectionIds).order("order_index")).data ?? []
        : [];
      return { sections: sections.data ?? [], headers, questions: questions.data ?? [] };
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["checklist", typeId] });

  const addAuditType = async () => {
    if (!newTypeName.trim() || !newTypeCode.trim()) {
      toast.error("أدخل اسم نوع التدقيق والكود");
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
    queryClient.invalidateQueries({ queryKey: ["audit-types"] });
  };

  /** يستبدل قائمة الفحص: حذف إن لم تُستخدم، وإلا أرشفة (active=false) للحفاظ على التقارير السابقة. */
  const purgeChecklist = async () => {
    const { data: oldQuestions } = await supabase.from("questions").select("id").eq("audit_type_id", typeId);
    const ids = (oldQuestions ?? []).map((question) => question.id);
    if (ids.length) {
      const { count } = await supabase
        .from("audit_answers")
        .select("id", { count: "exact", head: true })
        .in("question_id", ids);
      if (count && count > 0) {
        await supabase.from("questions").update({ active: false }).eq("audit_type_id", typeId);
        await supabase.from("sections").update({ active: false }).eq("audit_type_id", typeId);
        return "archived" as const;
      }
      await supabase.from("questions").delete().eq("audit_type_id", typeId);
    }
    const { data: oldSections } = await supabase.from("sections").select("id").eq("audit_type_id", typeId);
    const sectionIds = (oldSections ?? []).map((section) => section.id);
    if (sectionIds.length) {
      await supabase.from("headers").delete().in("section_id", sectionIds);
      await supabase.from("sections").delete().eq("audit_type_id", typeId);
    }
    return "deleted" as const;
  };

  const importChecklist = async (file: File) => {
    if (!typeId) {
      toast.error("اختر نوع التدقيق أولاً");
      return;
    }
    setImporting(true);
    try {
      const purge = replaceExisting ? await purgeChecklist() : null;
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
        const questionText = pick(row, ["question", "السؤال", "نص البند", "بند التدقيق", "item text", "البند"], ID_EXCLUDE);
        if (!sectionName || !questionText) continue;

        let sectionId = sectionCache.get(sectionName);
        if (!sectionId) {
          const { data: created, error } = await supabase
            .from("sections")
            .insert({
              audit_type_id: typeId,
              name_ar: sectionName,
              order_index: sectionOrder++,
              is_delivery: /delivery|توصيل/i.test(sectionName),
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

        const maxScoreRaw = Number(pick(row, ["max score", "max", "الدرجة القصوى", "الدرجة", "score"]));
        const { error: questionError } = await supabase.from("questions").insert({
          audit_type_id: typeId,
          section_id: sectionId,
          header_id: headerId,
          item_id: pick(row, ["item id", "رقم البند", "كود البند", "الرقم", "كود", "id"]) || String(itemOrder + 1),
          text_ar: questionText,
          max_score: Number.isFinite(maxScoreRaw) && maxScoreRaw > 0 ? maxScoreRaw : 4,
          item_order: itemOrder++,
        });
        if (questionError) throw questionError;
        imported += 1;
      }

      toast.success(
        purge === "archived"
          ? `تم أرشفة قائمة الفحص السابقة (مستخدمة في تدقيقات) واستيراد ${imported} سؤالاً`
          : `تم استيراد ${imported} سؤالاً`,
      );
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر استيراد الملف");
    } finally {
      setImporting(false);
    }
  };

  const addSection = async () => {
    if (!typeId || !newSection.trim()) return;
    const order = (tree?.sections.length ?? 0);
    await supabase.from("sections").insert({
      audit_type_id: typeId,
      name_ar: newSection.trim().slice(0, 160),
      order_index: order,
      is_delivery: /delivery|توصيل/i.test(newSection),
    });
    setNewSection("");
    refresh();
  };

  const addHeader = async (sectionId: string) => {
    const label = (newHeader[sectionId] ?? "").trim();
    if (!label) return;
    const order = (tree?.headers.filter((header) => header.section_id === sectionId).length ?? 0);
    await supabase.from("headers").insert({ section_id: sectionId, label_ar: label.slice(0, 160), order_index: order });
    setNewHeader((prev) => ({ ...prev, [sectionId]: "" }));
    refresh();
  };

  const addQuestion = async (sectionId: string, headerId: string | null) => {
    const key = headerId ?? sectionId;
    const text = (newQuestion[key] ?? "").trim();
    if (!text) return;
    const order = (tree?.questions.length ?? 0);
    await supabase.from("questions").insert({
      audit_type_id: typeId,
      section_id: sectionId,
      header_id: headerId,
      item_id: `M-${order + 1}`,
      text_ar: text.slice(0, 500),
      max_score: 4,
      item_order: order,
    });
    setNewQuestion((prev) => ({ ...prev, [key]: "" }));
    refresh();
  };

  const swapOrder = async (
    table: "sections" | "headers" | "questions",
    field: "order_index" | "item_order",
    a: { id: string; order: number },
    b: { id: string; order: number },
  ) => {
    await Promise.all([
      supabase.from(table).update({ [field]: b.order } as never).eq("id", a.id),
      supabase.from(table).update({ [field]: a.order } as never).eq("id", b.id),
    ]);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3 p-5">
        <div className="space-y-1.5">
          <Label>نوع التدقيق</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
            <SelectContent>
              {types?.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name_ar}
                  {type.active ? "" : " (غير مفعّل)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tname">نوع تدقيق جديد</Label>
            <Input id="tname" value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} placeholder="مثال: سلامة المنشأة" />
          </div>
          <div className="w-28 space-y-1.5">
            <Label htmlFor="tcode">الكود</Label>
            <Input id="tcode" value={newTypeCode} onChange={(event) => setNewTypeCode(event.target.value)} placeholder="FS2" />
          </div>
          <Button onClick={addAuditType}><Plus className="size-4" /> إضافة</Button>
        </div>

        {typeId && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
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
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={replaceExisting} onCheckedChange={setReplaceExisting} />
              استبدال القائمة الحالية
            </label>
            <p className="w-full text-xs text-muted-foreground">
              الأعمدة المتوقعة: القسم (Section)، العنوان (Header)، رقم البند (Item ID)، السؤال (Question)، الدرجة القصوى (Max Score).
            </p>
          </div>
        )}
      </div>

      {typeId && (
        <div className="surface-card flex flex-wrap items-end gap-2 p-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="newsec">قسم جديد</Label>
            <Input id="newsec" value={newSection} onChange={(event) => setNewSection(event.target.value)} />
          </div>
          <Button onClick={addSection}><Plus className="size-4" /> إضافة قسم</Button>
        </div>
      )}

      {tree?.sections.map((section, sectionIndex) => {
        const sectionHeaders = tree.headers.filter((header) => header.section_id === section.id);
        const sectionQuestions = tree.questions.filter((question) => question.section_id === section.id);
        const isOpen = openSection === section.id;
        return (
          <div key={section.id} className="surface-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className="text-sm font-semibold" onClick={() => setOpenSection(isOpen ? null : section.id)}>
                {section.name_ar} <span className="text-xs text-muted-foreground">({sectionQuestions.length} بند)</span>
              </button>
              <div className="mr-auto flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="تحريك لأعلى"
                  disabled={sectionIndex === 0}
                  onClick={() => {
                    const prev = tree.sections[sectionIndex - 1]!;
                    swapOrder("sections", "order_index", { id: section.id, order: section.order_index }, { id: prev.id, order: prev.order_index });
                  }}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="تحريك لأسفل"
                  disabled={sectionIndex === tree.sections.length - 1}
                  onClick={() => {
                    const next = tree.sections[sectionIndex + 1]!;
                    swapOrder("sections", "order_index", { id: section.id, order: section.order_index }, { id: next.id, order: next.order_index });
                  }}
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Switch
                  checked={section.active}
                  onCheckedChange={async (value) => {
                    await supabase.from("sections").update({ active: value }).eq("id", section.id);
                    refresh();
                  }}
                />
              </div>
            </div>

            {isOpen && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    className="flex-1"
                    placeholder="عنوان فرعي جديد"
                    value={newHeader[section.id] ?? ""}
                    onChange={(event) => setNewHeader((prev) => ({ ...prev, [section.id]: event.target.value }))}
                  />
                  <Button variant="outline" onClick={() => addHeader(section.id)}>إضافة عنوان</Button>
                </div>

                {[...sectionHeaders.map((header) => ({ id: header.id, label: header.label_ar })), { id: null, label: "بدون عنوان" }].map(
                  (group) => {
                    const groupQuestions = sectionQuestions.filter((question) => question.header_id === group.id);
                    if (!group.id && groupQuestions.length === 0) return null;
                    const key = group.id ?? section.id;
                    return (
                      <div key={key} className="rounded-md border border-border p-3">
                        <div className="text-xs font-semibold text-primary">{group.label}</div>
                        <div className="mt-2 space-y-2">
                          {groupQuestions.map((question, questionIndex) => (
                            <QuestionRow
                              key={question.id}
                              question={question}
                              sections={tree.sections}
                              headers={tree.headers}
                              onSaved={refresh}
                              onMove={(direction) => {
                                const neighbour = groupQuestions[questionIndex + direction];
                                if (!neighbour) return;
                                swapOrder(
                                  "questions",
                                  "item_order",
                                  { id: question.id, order: question.item_order },
                                  { id: neighbour.id, order: neighbour.item_order },
                                );
                              }}
                              canMoveUp={questionIndex > 0}
                              canMoveDown={questionIndex < groupQuestions.length - 1}
                            />
                          ))}
                          <div className="flex flex-wrap items-end gap-2">
                            <Input
                              className="flex-1"
                              placeholder="سؤال جديد"
                              value={newQuestion[key] ?? ""}
                              onChange={(event) => setNewQuestion((prev) => ({ ...prev, [key]: event.target.value }))}
                            />
                            <Button variant="outline" onClick={() => addQuestion(section.id, group.id)}>
                              إضافة سؤال
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type QuestionRowProps = {
  question: { id: string; item_id: string; text_ar: string; max_score: number; active: boolean; section_id: string; header_id: string | null };
  sections: { id: string; name_ar: string }[];
  headers: { id: string; label_ar: string; section_id: string }[];
  onSaved: () => void;
  onMove: (direction: 1 | -1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

function QuestionRow({ question, sections, headers, onSaved, onMove, canMoveUp, canMoveDown }: QuestionRowProps) {
  const [text, setText] = useState(question.text_ar);
  const [maxScore, setMaxScore] = useState(String(question.max_score));
  const [sectionId, setSectionId] = useState(question.section_id);
  const [headerId, setHeaderId] = useState(question.header_id ?? "none");
  const dirty =
    text !== question.text_ar ||
    Number(maxScore) !== question.max_score ||
    sectionId !== question.section_id ||
    headerId !== (question.header_id ?? "none");

  const save = async () => {
    const score = Number(maxScore);
    if (!text.trim() || !Number.isFinite(score) || score <= 0) {
      toast.error("تحقق من نص السؤال والدرجة القصوى");
      return;
    }
    const { error } = await supabase
      .from("questions")
      .update({
        text_ar: text.trim().slice(0, 500),
        max_score: score,
        section_id: sectionId,
        header_id: headerId === "none" ? null : headerId,
      })
      .eq("id", question.id);
    if (error) {
      toast.error("تعذر حفظ التعديل");
      return;
    }
    toast.success("تم الحفظ");
    onSaved();
  };

  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span dir="ltr">{question.item_id}</span>
        <div className="mr-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="أعلى" disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ChevronUp className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="أسفل" disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ChevronDown className="size-4" />
          </Button>
          <Switch
            checked={question.active}
            onCheckedChange={async (value) => {
              await supabase.from("questions").update({ active: value }).eq("id", question.id);
              onSaved();
            }}
          />
        </div>
      </div>
      <Textarea className="mt-2 text-sm" rows={2} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          className="w-24"
          type="number"
          min={1}
          value={maxScore}
          onChange={(event) => setMaxScore(event.target.value)}
          aria-label="الدرجة القصوى"
        />
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>{section.name_ar}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={headerId} onValueChange={setHeaderId}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون عنوان</SelectItem>
            {headers
              .filter((header) => header.section_id === sectionId)
              .map((header) => (
                <SelectItem key={header.id} value={header.id}>{header.label_ar}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!dirty} onClick={save}><Save className="size-4" /> حفظ</Button>
      </div>
    </div>
  );
}
