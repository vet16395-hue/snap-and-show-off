import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { computeAudit, countUnanswered, type ScoringSection } from "@/lib/scoring";
import { deletePhoto, signedPhotoUrls, uploadQuestionPhoto } from "@/lib/photos";

export const Route = createFileRoute("/_authenticated/audits/$id")({
  head: () => ({
    meta: [
      { title: "تنفيذ التدقيق — SBAS" },
      { name: "description", content: "تنفيذ التدقيق قسماً بقسم مع التقييم والصور والخصومات." },
      { property: "og:title", content: "تنفيذ التدقيق — SBAS" },
      { property: "og:description", content: "شاشة تنفيذ تدقيق فرع سعودي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditRunner,
});

const SCORE_OPTIONS = [
  { value: 4, label: "4 — مطابق" },
  { value: 2, label: "2 — مطابق جزئياً" },
  { value: 1, label: "1 — ضعيف" },
  { value: 0, label: "0 — غير مطابق" },
];

type AnswerState = { score: number | null; isNa: boolean; comment: string };

function AuditRunner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [sectionNa, setSectionNa] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["audit", id],
    queryFn: async () => {
      const { data: audit, error } = await supabase
        .from("audits")
        .select("id, status, audit_date, audit_type_id, branch_manager, branches(name_ar), audit_types(name_ar)")
        .eq("id", id)
        .single();
      if (error) throw error;

      const [sections, headers, questions, savedAnswers, statuses, sectionDeductions, generalDeductions, photos] =
        await Promise.all([
          supabase.from("sections").select("*").eq("audit_type_id", audit.audit_type_id).eq("active", true).order("order_index"),
          supabase.from("headers").select("*").order("order_index"),
          supabase.from("questions").select("*").eq("audit_type_id", audit.audit_type_id).eq("active", true).order("item_order"),
          supabase.from("audit_answers").select("*").eq("audit_id", id),
          supabase.from("audit_section_status").select("*").eq("audit_id", id),
          supabase.from("audit_section_deductions").select("*").eq("audit_id", id),
          supabase.from("audit_general_deductions").select("*").eq("audit_id", id),
          supabase.from("photos").select("*").eq("audit_id", id),
        ]);

      return {
        audit,
        sections: sections.data ?? [],
        headers: headers.data ?? [],
        questions: questions.data ?? [],
        savedAnswers: savedAnswers.data ?? [],
        statuses: statuses.data ?? [],
        sectionDeductions: sectionDeductions.data ?? [],
        generalDeductions: generalDeductions.data ?? [],
        photos: photos.data ?? [],
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const nextAnswers: Record<string, AnswerState> = {};
    data.savedAnswers.forEach((answer) => {
      nextAnswers[answer.question_id] = {
        score: answer.score,
        isNa: answer.is_na,
        comment: answer.comment ?? "",
      };
    });
    setAnswers(nextAnswers);
    const nextStatus: Record<string, boolean> = {};
    data.statuses.forEach((status) => {
      nextStatus[status.section_id] = status.is_na;
    });
    setSectionNa(nextStatus);
  }, [data]);

  const photosByQuestion = useMemo(() => {
    const map: Record<string, { id: string; storage_path: string }[]> = {};
    data?.photos.forEach((photo) => {
      map[photo.question_id] = [...(map[photo.question_id] ?? []), photo];
    });
    return map;
  }, [data]);

  const { data: photoUrls } = useQuery({
    queryKey: ["photo-urls", id, data?.photos.length],
    enabled: !!data && data.photos.length > 0,
    queryFn: () => signedPhotoUrls((data?.photos ?? []).map((photo) => photo.storage_path)),
  });

  const scoringSections: ScoringSection[] = useMemo(() => {
    if (!data) return [];
    return data.sections.map((section) => ({
      id: section.id,
      nameAr: section.name_ar,
      nameEn: section.name_en,
      isDelivery: section.is_delivery,
      isNa: !!sectionNa[section.id],
      questions: data.questions
        .filter((question) => question.section_id === section.id)
        .map((question) => ({ id: question.id, maxScore: question.max_score })),
      deductions: data.sectionDeductions
        .filter((deduction) => deduction.section_id === section.id)
        .map((deduction) => ({ reasonText: deduction.reason_text, percentage: Number(deduction.percentage) })),
    }));
  }, [data, sectionNa]);

  const result = useMemo(
    () =>
      computeAudit(
        scoringSections,
        answers,
        (data?.generalDeductions ?? []).map((deduction) => ({
          reasonText: deduction.reason_text,
          percentage: Number(deduction.percentage),
        })),
      ),
    [scoringSections, answers, data],
  );

  if (isLoading || !data) {
    return (
      <AppShell title="تنفيذ التدقيق">
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      </AppShell>
    );
  }

  if (data.sections.length === 0) {
    return (
      <AppShell title="تنفيذ التدقيق" subtitle="لا توجد قائمة فحص">
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          لم يتم استيراد قائمة الفحص لهذا النوع من التدقيق بعد. توجّه إلى صفحة الإدارة لاستيراد ملف Excel.
        </div>
      </AppShell>
    );
  }

  const section = data.sections[Math.min(stepIndex, data.sections.length - 1)]!;
  const sectionQuestions = data.questions.filter((question) => question.section_id === section.id);
  const isNaSection = !!sectionNa[section.id];
  const branchName = (data.audit.branches as { name_ar: string } | null)?.name_ar ?? "";
  const readOnly = data.audit.status === "submitted";

  const persistAnswer = (questionId: string, state: AnswerState) => {
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(async () => {
      const { error } = await supabase.from("audit_answers").upsert(
        {
          audit_id: id,
          question_id: questionId,
          score: state.isNa ? null : state.score,
          is_na: state.isNa,
          comment: state.comment.slice(0, 1000) || null,
        },
        { onConflict: "audit_id,question_id" },
      );
      if (error) toast.error("تعذر حفظ الإجابة");
    }, 400);
  };

  const updateAnswer = (questionId: string, patch: Partial<AnswerState>) => {
    if (readOnly) return;
    setAnswers((previous) => {
      const current = previous[questionId] ?? { score: null, isNa: false, comment: "" };
      const next = { ...current, ...patch };
      persistAnswer(questionId, next);
      return { ...previous, [questionId]: next };
    });
  };

  const toggleSectionNa = async (value: boolean) => {
    if (readOnly) return;
    setSectionNa((previous) => ({ ...previous, [section.id]: value }));
    const { error } = await supabase
      .from("audit_section_status")
      .upsert({ audit_id: id, section_id: section.id, is_na: value }, { onConflict: "audit_id,section_id" });
    if (error) toast.error("تعذر تحديث حالة القسم");
  };

  const addSectionDeduction = async (reason: string, percentage: number) => {
    const { error } = await supabase
      .from("audit_section_deductions")
      .insert({ audit_id: id, section_id: section.id, reason_text: reason.slice(0, 300), percentage });
    if (error) {
      toast.error("تعذر إضافة الخصم");
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["audit", id] });
  };

  const removeSectionDeduction = async (deductionId: string) => {
    await supabase.from("audit_section_deductions").delete().eq("id", deductionId);
    queryClient.invalidateQueries({ queryKey: ["audit", id] });
  };

  const handlePhoto = async (questionId: string, file: File) => {
    try {
      await uploadQuestionPhoto(id, questionId, file);
      queryClient.invalidateQueries({ queryKey: ["audit", id] });
      toast.success("تم رفع الصورة");
    } catch {
      toast.error("تعذر رفع الصورة");
    }
  };

  const submitAudit = async () => {
    const remaining = countUnanswered(scoringSections, answers);
    if (remaining > 0) {
      toast.error(`تبقّى ${remaining} سؤالاً بدون إجابة`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("audits")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", id);
    setSaving(false);
    if (error) return toast.error("تعذر إنهاء التدقيق");
    toast.success("تم إنهاء التدقيق");
    navigate({ to: "/audits/$id/report", params: { id } });
  };

  const currentDeductions = data.sectionDeductions.filter((deduction) => deduction.section_id === section.id);
  const sectionResult = result.sections.find((entry) => entry.sectionId === section.id);

  return (
    <AppShell
      title={branchName}
      subtitle={`${data.audit.audit_date} · القسم ${stepIndex + 1} من ${data.sections.length}`}
      action={
        <Badge variant={readOnly ? "default" : "outline"}>{readOnly ? "مكتمل" : "مسودة"}</Badge>
      }
    >
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((stepIndex + 1) / data.sections.length) * 100}%` }}
        />
      </div>

      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div>
          <h2 className="text-lg font-bold">{section.name_ar}</h2>
          {section.is_delivery && (
            <span className="text-xs text-muted-foreground">قسم التوصيل — يُحتسب بشكل منفصل</span>
          )}
        </div>
        <div className="mr-auto flex items-center gap-2 text-sm">
          <Label htmlFor="section-na">القسم غير منطبق</Label>
          <Switch id="section-na" checked={isNaSection} onCheckedChange={toggleSectionNa} disabled={readOnly} />
        </div>
      </div>

      {!isNaSection && (
        <div className="space-y-3">
          {sectionQuestions.map((question) => {
            const answer = answers[question.id] ?? { score: null, isNa: false, comment: "" };
            const header = data.headers.find((entry) => entry.id === question.header_id);
            const needsPhoto =
              question.requires_photo_if_below_max &&
              !answer.isNa &&
              answer.score !== null &&
              answer.score < question.max_score;
            const questionPhotos = photosByQuestion[question.id] ?? [];

            return (
              <div key={question.id} className="surface-card p-4">
                {header && <div className="text-xs font-semibold text-primary">{header.label_ar}</div>}
                <div className="mt-1 flex gap-2 text-sm font-medium">
                  <span className="text-muted-foreground">{question.item_id}</span>
                  <span>{question.text_ar}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {SCORE_OPTIONS.filter((option) => option.value <= question.max_score).map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={!answer.isNa && answer.score === option.value ? "default" : "outline"}
                      disabled={readOnly}
                      onClick={() => updateAnswer(question.id, { score: option.value, isNa: false })}
                    >
                      {option.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={answer.isNa ? "secondary" : "outline"}
                    disabled={readOnly}
                    onClick={() => updateAnswer(question.id, { isNa: !answer.isNa, score: null })}
                  >
                    غير منطبق
                  </Button>
                </div>

                <Textarea
                  className="mt-3"
                  placeholder="ملاحظات"
                  maxLength={1000}
                  value={answer.comment}
                  disabled={readOnly}
                  onChange={(event) => updateAnswer(question.id, { comment: event.target.value })}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!readOnly && (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
                      <Camera className="size-4" /> إضافة صورة
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handlePhoto(question.id, file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {needsPhoto && questionPhotos.length === 0 && (
                    <span className="text-xs text-destructive">مطلوب إرفاق صورة عند التقييم الأقل من الحد الأقصى</span>
                  )}
                  {questionPhotos.map((photo) => (
                    <div key={photo.id} className="relative">
                      <img
                        src={photoUrls?.[photo.storage_path]}
                        alt={`صورة توثيق للسؤال ${question.item_id}`}
                        loading="lazy"
                        className="size-16 rounded-md object-cover"
                      />
                      {!readOnly && (
                        <button
                          className="absolute -top-2 -left-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground"
                          aria-label="حذف الصورة"
                          onClick={async () => {
                            await deletePhoto(photo.id, photo.storage_path);
                            queryClient.invalidateQueries({ queryKey: ["audit", id] });
                          }}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <SectionDeductions
            deductions={currentDeductions}
            readOnly={readOnly}
            onAdd={addSectionDeduction}
            onRemove={removeSectionDeduction}
          />

          {sectionResult && (
            <div className="surface-card flex flex-wrap gap-4 p-4 text-sm">
              <span>الدرجة: <strong>{sectionResult.rawScore}</strong> / {sectionResult.max}</span>
              <span>الخصم الداخلي: <strong>{sectionResult.deductionPercentage}%</strong></span>
              <span>النهائي: <strong>{sectionResult.percentage}%</strong></span>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2">
        <Button
          variant="outline"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((index) => index - 1)}
        >
          <ChevronRight className="size-4" /> السابق
        </Button>
        {stepIndex < data.sections.length - 1 ? (
          <Button className="mr-auto" onClick={() => setStepIndex((index) => index + 1)}>
            التالي <ChevronLeft className="size-4" />
          </Button>
        ) : readOnly ? (
          <Button asChild className="mr-auto">
            <Link to="/audits/$id/report" params={{ id }}>عرض التقرير</Link>
          </Button>
        ) : (
          <Button className="mr-auto" disabled={saving} onClick={submitAudit}>
            {saving && <Loader2 className="size-4 animate-spin" />} إنهاء التدقيق
          </Button>
        )}
      </div>
    </AppShell>
  );
}

function SectionDeductions({
  deductions,
  readOnly,
  onAdd,
  onRemove,
}: {
  deductions: { id: string; reason_text: string; percentage: number }[];
  readOnly: boolean;
  onAdd: (reason: string, percentage: number) => void;
  onRemove: (id: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [percentage, setPercentage] = useState("");

  return (
    <div className="surface-card p-4">
      <h3 className="text-sm font-bold">الخصومات الداخلية للقسم</h3>
      <div className="mt-3 space-y-2">
        {deductions.map((deduction) => (
          <div key={deduction.id} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span>{deduction.reason_text}</span>
            <strong className="mr-auto">{deduction.percentage}%</strong>
            {!readOnly && (
              <button aria-label="حذف الخصم" onClick={() => onRemove(deduction.id)}>
                <Trash2 className="size-4 text-destructive" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            className="flex-1"
            placeholder="سبب الخصم"
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
          <Button
            variant="outline"
            onClick={() => {
              const value = Number(percentage);
              if (!reason.trim() || !Number.isFinite(value) || value <= 0 || value > 100) {
                toast.error("أدخل سبباً ونسبة بين 1 و 100");
                return;
              }
              onAdd(reason.trim(), value);
              setReason("");
              setPercentage("");
            }}
          >
            إضافة
          </Button>
        </div>
      )}
    </div>
  );
}
