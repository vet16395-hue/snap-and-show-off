import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Printer, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeAudit, type ScoringSection } from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/audits/$id/report")({
  head: () => ({
    meta: [
      { title: "تقرير التدقيق — SBAS" },
      { name: "description", content: "ملخص نتائج التدقيق مع الخصومات والنتيجة النهائية وخيارات التصدير." },
      { property: "og:title", content: "تقرير التدقيق — SBAS" },
      { property: "og:description", content: "نتيجة تدقيق فرع سعودي وتقارير PDF و Word." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [percentage, setPercentage] = useState("");

  const { data } = useQuery({
    queryKey: ["audit-report", id],
    queryFn: async () => {
      const { data: audit, error } = await supabase
        .from("audits")
        .select("id, status, audit_date, audit_type_id, branch_manager, auditor_id, branches(name_ar), audit_types(name_ar)")
        .eq("id", id)
        .single();
      if (error) throw error;
      const [sections, questions, answers, statuses, sectionDeductions, generalDeductions, auditor] =
        await Promise.all([
          supabase.from("sections").select("*").eq("audit_type_id", audit.audit_type_id).eq("active", true).order("order_index"),
          supabase.from("questions").select("*").eq("audit_type_id", audit.audit_type_id).eq("active", true).order("item_order"),
          supabase.from("audit_answers").select("*").eq("audit_id", id),
          supabase.from("audit_section_status").select("*").eq("audit_id", id),
          supabase.from("audit_section_deductions").select("*").eq("audit_id", id),
          supabase.from("audit_general_deductions").select("*").eq("audit_id", id),
          supabase.from("profiles").select("full_name, email").eq("id", audit.auditor_id).maybeSingle(),
        ]);
      return {
        audit,
        sections: sections.data ?? [],
        questions: questions.data ?? [],
        answers: answers.data ?? [],
        statuses: statuses.data ?? [],
        sectionDeductions: sectionDeductions.data ?? [],
        generalDeductions: generalDeductions.data ?? [],
        auditor: auditor.data,
      };
    },
  });

  const result = useMemo(() => {
    if (!data) return null;
    const naSections = new Set(data.statuses.filter((status) => status.is_na).map((status) => status.section_id));
    const scoringSections: ScoringSection[] = data.sections.map((section) => ({
      id: section.id,
      nameAr: section.name_ar,
      nameEn: section.name_en,
      isDelivery: section.is_delivery,
      isNa: naSections.has(section.id),
      questions: data.questions
        .filter((question) => question.section_id === section.id)
        .map((question) => ({ id: question.id, maxScore: question.max_score })),
      deductions: data.sectionDeductions
        .filter((deduction) => deduction.section_id === section.id)
        .map((deduction) => ({ reasonText: deduction.reason_text, percentage: Number(deduction.percentage) })),
    }));
    const answerMap: Record<string, { score: number | null; isNa: boolean }> = {};
    data.answers.forEach((answer) => {
      answerMap[answer.question_id] = { score: answer.score, isNa: answer.is_na };
    });
    return computeAudit(
      scoringSections,
      answerMap,
      data.generalDeductions.map((deduction) => ({
        reasonText: deduction.reason_text,
        percentage: Number(deduction.percentage),
      })),
    );
  }, [data]);

  if (!data || !result) {
    return (
      <AppShell title="تقرير التدقيق">
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      </AppShell>
    );
  }

  const branch = (data.audit.branches as { name_ar: string } | null)?.name_ar ?? "";
  const auditType = (data.audit.audit_types as { name_ar: string } | null)?.name_ar ?? "";
  const auditorName = data.auditor?.full_name || data.auditor?.email || "";

  const addGeneralDeduction = async () => {
    const value = Number(percentage);
    if (!reason.trim() || !Number.isFinite(value) || value <= 0 || value > 100) {
      toast.error("أدخل سبباً ونسبة بين 1 و 100");
      return;
    }
    const { error } = await supabase
      .from("audit_general_deductions")
      .insert({ audit_id: id, reason_text: reason.trim().slice(0, 300), percentage: value });
    if (error) {
      toast.error("تعذر إضافة الخصم العام");
      return;
    }
    setReason("");
    setPercentage("");
    queryClient.invalidateQueries({ queryKey: ["audit-report", id] });
  };

  const exportWord = () => {
    const rows = result.sections
      .filter((entry) => !entry.excluded)
      .map(
        (entry) =>
          `<tr><td>${entry.nameAr}</td><td>${entry.rawScore}/${entry.max}</td><td>${entry.deductionPercentage}%</td><td>${entry.percentage}%</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير تدقيق ${branch}</title></head>
<body style="font-family:Arial">
<h1>تقرير تدقيق — ${branch}</h1>
<p>نوع التدقيق: ${auditType} — التاريخ: ${data.audit.audit_date} — المدقق: ${auditorName} — مدير الفرع: ${data.audit.branch_manager ?? "-"}</p>
<table border="1" cellspacing="0" cellpadding="6" width="100%">
<tr><th>القسم</th><th>الدرجة</th><th>الخصم الداخلي</th><th>النسبة</th></tr>${rows}</table>
<h2>النتيجة الإجمالية قبل الخصم العام: ${result.overallPercentage}%</h2>
<h2>الخصم العام: ${result.generalDeductionPercentage}%</h2>
<h2>النتيجة النهائية: ${result.finalPercentage}%</h2>
${result.delivery ? `<h3>قسم التوصيل (منفصل): ${result.delivery.percentage}%</h3>` : ""}
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "application/msword" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `SBAS-${branch}-${data.audit.audit_date}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell
      title="تقرير التدقيق"
      subtitle={`${branch} · ${data.audit.audit_date}`}
      action={
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> PDF
          </Button>
          <Button onClick={exportWord}>
            <Download className="size-4" /> Word
          </Button>
        </div>
      }
    >
      <div className="print-area space-y-4">
        <div className="surface-card grid gap-2 p-5 text-sm sm:grid-cols-2">
          <span>الفرع: <strong>{branch}</strong></span>
          <span>نوع التدقيق: <strong>{auditType}</strong></span>
          <span>المدقق: <strong>{auditorName}</strong></span>
          <span>مدير الفرع: <strong>{data.audit.branch_manager || "—"}</strong></span>
        </div>

        <div className="brand-banner rounded-2xl p-6 text-center">
          <div className="text-sm opacity-80">النتيجة النهائية</div>
          <div className="text-5xl font-extrabold">{result.finalPercentage}%</div>
          <div className="mt-2 text-xs opacity-80">
            قبل الخصم العام {result.overallPercentage}% · خصم عام {result.generalDeductionPercentage}%
          </div>
        </div>

        <div className="surface-card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted text-right">
              <tr>
                <th className="p-3">القسم</th>
                <th className="p-3">الدرجة</th>
                <th className="p-3">الخصم الداخلي</th>
                <th className="p-3">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {result.sections
                .filter((entry) => !entry.excluded && !entry.isDelivery)
                .map((entry) => (
                  <tr key={entry.sectionId} className="border-t border-border">
                    <td className="p-3">{entry.nameAr}</td>
                    <td className="p-3">{entry.rawScore} / {entry.max}</td>
                    <td className="p-3">{entry.deductionPercentage}%</td>
                    <td className="p-3 font-bold">{entry.percentage}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {result.delivery && (
          <div className="surface-card p-4 text-sm">
            قسم التوصيل (محسوب بشكل منفصل): <strong>{result.delivery.percentage}%</strong>
          </div>
        )}

        <div className="surface-card p-4">
          <h3 className="text-sm font-bold">الخصومات العامة</h3>
          <div className="mt-3 space-y-2">
            {data.generalDeductions.map((deduction) => (
              <div key={deduction.id} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                <span>{deduction.reason_text}</span>
                <strong className="mr-auto">{deduction.percentage}%</strong>
                <button
                  aria-label="حذف الخصم العام"
                  className="print:hidden"
                  onClick={async () => {
                    await supabase.from("audit_general_deductions").delete().eq("id", deduction.id);
                    queryClient.invalidateQueries({ queryKey: ["audit-report", id] });
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            <Input
              className="flex-1"
              placeholder="سبب الخصم العام"
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Input
              className="w-24"
              type="number"
              min={0}
              max={100}
              placeholder="%"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
            />
            <Button variant="outline" onClick={addGeneralDeduction}>إضافة</Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
