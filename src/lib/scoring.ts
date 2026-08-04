/**
 * SBAS scoring engine — pure, UI-free, unit-testable.
 * Implements Section 7 of the specification, in exact order of operations.
 */

export const ALLOWED_SCORES = [4, 2, 1, 0] as const;
export type AllowedScore = (typeof ALLOWED_SCORES)[number];

export interface ScoringQuestion {
  id: string;
  maxScore: number;
}

export interface ScoringSection {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  isDelivery: boolean;
  /** section-level N/A toggle: excludes the whole section from scoring and the report */
  isNa: boolean;
  questions: ScoringQuestion[];
  /** internal deduction entries (percentages of the section's MAX score) */
  deductions: { reasonText: string; percentage: number }[];
}

export interface ScoringAnswer {
  score: number | null;
  isNa: boolean;
}

export interface SectionResult {
  sectionId: string;
  nameAr: string;
  nameEn?: string | null;
  isDelivery: boolean;
  excluded: boolean;
  max: number;
  rawScore: number;
  deductionPercentage: number;
  deductionValue: number;
  finalScore: number;
  percentage: number;
}

export interface AuditResult {
  sections: SectionResult[];
  delivery: SectionResult | null;
  overallMax: number;
  overallRawScore: number;
  overallPercentage: number;
  generalDeductionPercentage: number;
  finalPercentage: number;
}

const clampPct = (value: number) => Math.min(100, Math.max(0, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

export function computeSection(
  section: ScoringSection,
  answers: Record<string, ScoringAnswer | undefined>,
): SectionResult {
  const base: Omit<SectionResult, "max" | "rawScore" | "deductionValue" | "finalScore" | "percentage"> = {
    sectionId: section.id,
    nameAr: section.nameAr,
    nameEn: section.nameEn ?? null,
    isDelivery: section.isDelivery,
    excluded: section.isNa,
    deductionPercentage: clampPct(
      section.deductions.reduce((sum, deduction) => sum + (Number(deduction.percentage) || 0), 0),
    ),
  };

  if (section.isNa) {
    return { ...base, max: 0, rawScore: 0, deductionValue: 0, finalScore: 0, percentage: 0 };
  }

  let max = 0;
  let rawScore = 0;
  for (const question of section.questions) {
    const answer = answers[question.id];
    // Step 1 — N/A questions are excluded entirely, as if they never existed.
    if (!answer || answer.isNa || answer.score === null) continue;
    max += question.maxScore;
    rawScore += answer.score;
  }

  // Step 4 — internal deduction is a percentage of the section's MAXIMUM score.
  const deductionValue = round2((max * base.deductionPercentage) / 100);
  const finalScore = Math.max(0, round2(rawScore - deductionValue));
  const percentage = max > 0 ? round2((finalScore / max) * 100) : 0;

  return { ...base, max, rawScore, deductionValue, finalScore, percentage };
}

export function computeAudit(
  sections: ScoringSection[],
  answers: Record<string, ScoringAnswer | undefined>,
  generalDeductions: { reasonText: string; percentage: number }[] = [],
): AuditResult {
  const results = sections.map((section) => computeSection(section, answers));

  // Step 5 — Delivery is fully isolated from the branch score.
  const delivery = results.find((result) => result.isDelivery && !result.excluded) ?? null;
  const scored = results.filter((result) => !result.isDelivery && !result.excluded && result.max > 0);

  // Step 6 — Overall across all non-delivery, non-excluded sections.
  const overallMax = scored.reduce((sum, result) => sum + result.max, 0);
  const overallRawScore = round2(scored.reduce((sum, result) => sum + result.finalScore, 0));
  const overallPercentage = overallMax > 0 ? round2((overallRawScore / overallMax) * 100) : 0;

  // Step 7 — General deduction reduces only the final overall percentage.
  const generalDeductionPercentage = clampPct(
    generalDeductions.reduce((sum, deduction) => sum + (Number(deduction.percentage) || 0), 0),
  );
  const finalPercentage = round2(Math.max(0, overallPercentage - generalDeductionPercentage));

  return {
    sections: results,
    delivery,
    overallMax,
    overallRawScore,
    overallPercentage,
    generalDeductionPercentage,
    finalPercentage,
  };
}

export function isAnswered(answer: ScoringAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.isNa || answer.score !== null;
}

export function countUnanswered(
  sections: ScoringSection[],
  answers: Record<string, ScoringAnswer | undefined>,
): number {
  return sections
    .filter((section) => !section.isNa)
    .reduce(
      (total, section) =>
        total + section.questions.filter((question) => !isAnswered(answers[question.id])).length,
      0,
    );
}
