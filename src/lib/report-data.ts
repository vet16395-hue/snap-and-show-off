import { supabase } from "@/integrations/supabase/client";
import { signedPhotoUrls } from "@/lib/photos";
import { computeAudit, type AuditResult, type ScoringSection } from "@/lib/scoring";

export interface ReportPhoto {
  id: string;
  path: string;
  url: string;
}

export interface ReportQuestion {
  id: string;
  itemId: string;
  textAr: string;
  maxScore: number;
  score: number | null;
  isNa: boolean;
  comment: string;
  photos: ReportPhoto[];
}

export interface ReportHeaderGroup {
  id: string | null;
  labelAr: string;
  questions: ReportQuestion[];
}

export interface ReportSection {
  id: string;
  nameAr: string;
  isDelivery: boolean;
  excluded: boolean;
  groups: ReportHeaderGroup[];
  deductions: { id: string; reasonText: string; percentage: number }[];
}

export interface ReportModel {
  auditId: string;
  status: string;
  version: number;
  auditTypeName: string;
  auditTypeNameEn: string;
  branchName: string;
  branchManager: string;
  auditorName: string;
  auditDate: string;
  sections: ReportSection[];
  generalDeductions: { id: string; reasonText: string; percentage: number }[];
  result: AuditResult;
}

/** Loads everything needed to render the summary page and both report files. */
export async function loadReportModel(auditId: string): Promise<ReportModel> {
  const { data: audit, error } = await supabase
    .from("audits")
    .select(
      "id, status, version, audit_date, audit_type_id, branch_manager, auditor_id, branches(name_ar), audit_types(name_ar, name_en)",
    )
    .eq("id", auditId)
    .single();
  if (error) throw error;

  const [sections, headers, questions, answers, statuses, sectionDeductions, generalDeductions, photos, auditor] =
    await Promise.all([
      supabase
        .from("sections")
        .select("*")
        .eq("audit_type_id", audit.audit_type_id)
        .eq("active", true)
        .order("order_index"),
      supabase.from("headers").select("*").order("order_index"),
      supabase
        .from("questions")
        .select("*")
        .eq("audit_type_id", audit.audit_type_id)
        .eq("active", true)
        .order("item_order"),
      supabase.from("audit_answers").select("*").eq("audit_id", auditId),
      supabase.from("audit_section_status").select("*").eq("audit_id", auditId),
      supabase.from("audit_section_deductions").select("*").eq("audit_id", auditId),
      supabase.from("audit_general_deductions").select("*").eq("audit_id", auditId),
      supabase.from("photos").select("*").eq("audit_id", auditId),
      supabase.from("profiles").select("full_name, email").eq("id", audit.auditor_id).maybeSingle(),
    ]);

  const sectionRows = sections.data ?? [];
  const headerRows = headers.data ?? [];
  const questionRows = questions.data ?? [];
  const answerRows = answers.data ?? [];
  const photoRows = photos.data ?? [];
  const naSections = new Set((statuses.data ?? []).filter((row) => row.is_na).map((row) => row.section_id));

  const urls = await signedPhotoUrls(photoRows.map((photo) => photo.storage_path));

  const answerMap: Record<string, { score: number | null; isNa: boolean; comment: string }> = {};
  answerRows.forEach((row) => {
    answerMap[row.question_id] = { score: row.score, isNa: row.is_na, comment: row.comment ?? "" };
  });

  const scoringSections: ScoringSection[] = sectionRows.map((section) => ({
    id: section.id,
    nameAr: section.name_ar,
    nameEn: section.name_en,
    isDelivery: section.is_delivery,
    isNa: naSections.has(section.id),
    questions: questionRows
      .filter((question) => question.section_id === section.id)
      .map((question) => ({ id: question.id, maxScore: question.max_score })),
    deductions: (sectionDeductions.data ?? [])
      .filter((deduction) => deduction.section_id === section.id)
      .map((deduction) => ({ reasonText: deduction.reason_text, percentage: Number(deduction.percentage) })),
  }));

  const generalRows = (generalDeductions.data ?? []).map((row) => ({
    id: row.id,
    reasonText: row.reason_text,
    percentage: Number(row.percentage),
  }));

  const result = computeAudit(scoringSections, answerMap, generalRows);

  const modelSections: ReportSection[] = sectionRows.map((section) => {
    const sectionQuestions = questionRows.filter((question) => question.section_id === section.id);
    const groupIds = [
      ...headerRows.filter((header) => header.section_id === section.id).map((header) => header.id),
      null,
    ];
    const groups: ReportHeaderGroup[] = groupIds
      .map((groupId) => {
        const header = headerRows.find((row) => row.id === groupId);
        const groupQuestions = sectionQuestions.filter((question) => question.header_id === groupId);
        return {
          id: groupId,
          labelAr: header?.label_ar ?? "",
          questions: groupQuestions.map((question) => {
            const answer = answerMap[question.id];
            return {
              id: question.id,
              itemId: question.item_id,
              textAr: question.text_ar,
              maxScore: question.max_score,
              score: answer?.score ?? null,
              isNa: answer?.isNa ?? false,
              comment: answer?.comment ?? "",
              photos: photoRows
                .filter((photo) => photo.question_id === question.id)
                .map((photo) => ({ id: photo.id, path: photo.storage_path, url: urls[photo.storage_path] ?? "" })),
            };
          }),
        };
      })
      .filter((group) => group.questions.length > 0);

    return {
      id: section.id,
      nameAr: section.name_ar,
      isDelivery: section.is_delivery,
      excluded: naSections.has(section.id),
      groups,
      deductions: (sectionDeductions.data ?? [])
        .filter((deduction) => deduction.section_id === section.id)
        .map((deduction) => ({
          id: deduction.id,
          reasonText: deduction.reason_text,
          percentage: Number(deduction.percentage),
        })),
    };
  });

  return {
    auditId,
    status: audit.status,
    version: audit.version ?? 1,
    auditTypeName: (audit.audit_types as { name_ar: string } | null)?.name_ar ?? "",
    auditTypeNameEn: (audit.audit_types as { name_en: string | null } | null)?.name_en ?? "",
    branchName: (audit.branches as { name_ar: string } | null)?.name_ar ?? "",
    branchManager: audit.branch_manager ?? "",
    auditorName: auditor.data?.full_name || auditor.data?.email || "",
    auditDate: audit.audit_date,
    sections: modelSections,
    generalDeductions: generalRows,
    result,
  };
}

export function scoreLabel(question: { score: number | null; isNa: boolean }): string {
  if (question.isNa) return "N/A";
  if (question.score === null) return "—";
  return String(question.score);
}

export function reportFileBase(model: ReportModel): string {
  const type = (model.auditTypeNameEn || "Audit").replace(/[^A-Za-z0-9]+/g, "");
  const branch = (model.branchName || "Branch").replace(/[\\/:*?"<>|\s]+/g, "_");
  return `${type || "Audit"}_${branch}_${model.auditDate}`;
}
