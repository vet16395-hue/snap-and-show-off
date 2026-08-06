import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { computeAudit, type ScoringSection } from "@/lib/scoring";
import { deletePhoto, signedPhotoUrls, uploadQuestionPhoto } from "@/lib/photos";

export const Route = createFileRoute("/_authenticated/audits/$id")({
  head: () => ({
    meta: [
      { title: "Run Audit — SBAS" },
      { name: "description", content: "Score the checklist section by section, add comments, photos and deductions." },
      { property: "og:title", content: "Run Audit — SBAS" },
      { property: "og:description", content: "Seoudi branch audit execution screen." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditRunner,
});

const SCORE_OPTIONS = [
  { value: 4, label: "4 — Compliant" },
  { value: 2, label: "2 — Partial" },
  { value: 1, label: "1 — Poor" },
  { value: 0, label: "0 — Non-compliant" },
];

type AnswerState = { score: number | null; isNa: boolean; comment: string };

function AuditRunner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [sectionNa, setSectionNa] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["audit", id],
    queryFn: async () => {
      const { data: audit, error } = await supabase
        .from("audits")
        .select("id, status, version, audit_date, audit_type_id, branch_manager, branches(name_ar), audit_types(name_ar)")
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
      <AppShell title="Run Audit">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (data.sections.length === 0) {
    return (
      <AppShell title="Run Audit" subtitle="No checklist available">
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          No checklist has been set up for this audit type yet. Go to Admin → Checklist to import or build one.
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
      if (error) toast.error("Could not save the answer");
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
    if (error) toast.error("Could not update the section status");
  };

  const addSectionDeduction = async (reason: string, percentage: number) => {
    const { error } = await supabase
      .from("audit_section_deductions")
      .insert({ audit_id: id, section_id: section.id, reason_text: reason.slice(0, 300), percentage });
    if (error) {
      toast.error("Could not add the deduction");
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
      toast.success("Photo uploaded");
    } catch {
      toast.error("Could not upload the photo");
    }
  };

  const currentDeductions = data.sectionDeductions.filter((deduction) => deduction.section_id === section.id);
  const sectionResult = result.sections.find((entry) => entry.sectionId === section.id);

  return (
    <AppShell
      title={branchName}
      subtitle={`${data.audit.audit_date} · Section ${stepIndex + 1} of ${data.sections.length}`}
      action={
        <div className="flex items-center gap-2">
          <Badge variant={readOnly ? "default" : "outline"}>{readOnly ? "Completed" : "Draft"}</Badge>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/audits/$id/summary", params: { id } })}>
            Summary
          </Button>
        </div>
      }
    >
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((stepIndex + 1) / data.sections.length) * 100}%` }}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {data.sections.map((entry, index) => (
          <button
            key={entry.id}
            onClick={() => setStepIndex(index)}
            className={
              index === stepIndex
                ? "rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                : "rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            }
          >
            {index + 1}
          </button>
        ))}
      </div>

      <div className="surface-card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div dir="rtl" className="text-right">
          <h2 className="text-lg font-bold">{section.name_ar}</h2>
          {section.is_delivery && (
            <span className="text-xs text-muted-foreground">Delivery section — scored separately</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Label htmlFor="section-na">Section not applicable</Label>
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
                <div dir="rtl" className="text-right">
                  {header && <div className="text-xs font-semibold text-primary">{header.label_ar}</div>}
                  <div className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
                    {question.item_id}
                  </div>
                  <p className="text-sm font-semibold leading-relaxed">{question.text_ar}</p>
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
                    N/A
                  </Button>
                </div>

                <Textarea
                  className="mt-3"
                  placeholder="Comments"
                  maxLength={1000}
                  value={answer.comment}
                  disabled={readOnly}
                  onChange={(event) => updateAnswer(question.id, { comment: event.target.value })}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!readOnly && (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
                      <Camera className="size-4" /> Add photo
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
                    <span className="text-xs text-destructive">A photo is required when scoring below the maximum</span>
                  )}
                  {questionPhotos.map((photo) => (
                    <div key={photo.id} className="relative">
                      <img
                        src={photoUrls?.[photo.storage_path]}
                        alt={`Audit evidence for item ${question.item_id}`}
                        loading="lazy"
                        className="size-16 rounded-md object-cover"
                      />
                      {!readOnly && (
                        <button
                          className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-destructive text-destructive-foreground"
                          aria-label="Delete photo"
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
              <span>
                Score: <strong>{sectionResult.rawScore}</strong> / {sectionResult.max}
              </span>
              <span>
                Internal deduction: <strong>{sectionResult.deductionPercentage}%</strong>
              </span>
              <span>
                Final: <strong>{sectionResult.percentage}%</strong>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2">
        <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((index) => index - 1)}>
          <ChevronLeft className="size-4" /> Previous
        </Button>
        {stepIndex < data.sections.length - 1 ? (
          <Button className="ml-auto" onClick={() => setStepIndex((index) => index + 1)}>
            Next <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button asChild className="ml-auto">
            <Link to="/audits/$id/summary" params={{ id }}>
              Review summary <ChevronRight className="size-4" />
            </Link>
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
      <h3 className="text-sm font-bold">Internal section deductions</h3>
      <div className="mt-3 space-y-2">
        {deductions.map((deduction) => (
          <div key={deduction.id} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span>{deduction.reason_text}</span>
            <strong className="ml-auto">{deduction.percentage}%</strong>
            {!readOnly && (
              <button aria-label="Delete deduction" onClick={() => onRemove(deduction.id)}>
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
            placeholder="Deduction reason"
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
                toast.error("Enter a reason and a percentage between 1 and 100");
                return;
              }
              onAdd(reason.trim(), value);
              setReason("");
              setPercentage("");
            }}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
