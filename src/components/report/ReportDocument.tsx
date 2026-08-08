import { scoreLabel, type ReportModel } from "@/lib/report-data";

/**
 * Print/export representation of a full audit report.
 * The document is split into explicit A4 pages (`data-report-page`) so the PDF
 * exporter can rasterise one page per section instead of one long strip.
 * Uses inline hex styling only: the PDF rasteriser cannot parse modern CSS colour functions.
 */

const BRAND = "#214D32";
const LIME = "#A0D164";
const OFFWHITE = "#E5ECE5";
const LINE = "#d6ded6";

const PAGE_WIDTH = 794;

const page: React.CSSProperties = {
  width: PAGE_WIDTH,
  minHeight: 1123,
  background: "#ffffff",
  color: "#16211a",
  fontFamily: "Cairo, Arial, sans-serif",
  fontSize: 12,
  lineHeight: 1.6,
  padding: 40,
  boxSizing: "border-box",
  overflow: "hidden",
  margin: "0 auto 16px",
};

const th: React.CSSProperties = {
  border: `1px solid ${LINE}`,
  background: OFFWHITE,
  padding: "8px 10px",
  fontWeight: 700,
  textAlign: "left",
};
const td: React.CSSProperties = { border: `1px solid ${LINE}`, padding: "8px 10px", verticalAlign: "top" };
const arStyle: React.CSSProperties = { direction: "rtl", textAlign: "right", unicodeBidi: "isolate" };

function CoverHeader() {
  return (
    <div style={{ background: BRAND, color: "#ffffff", padding: 20, borderRadius: 8, textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>Quality department</div>
    </div>
  );
}

export function ReportDocument({ model }: { model: ReportModel }) {
  const { result } = model;
  const sections = model.sections.filter((section) => !section.excluded);
  const resultById = new Map(result.sections.map((section) => [section.sectionId, section]));
  if (result.delivery) resultById.set(result.delivery.sectionId, result.delivery);

  const photoSections = sections
    .map((section) => ({
      section,
      questions: section.groups
        .flatMap((group) => group.questions)
        .filter((question) => question.photos.length > 0),
    }))
    .filter((entry) => entry.questions.length > 0);

  return (
    <div dir="ltr" lang="en">
      {/* Page 1 — cover + summary */}
      <div style={page} data-report-page>
        <Header />

        <h1 style={{ fontSize: 24, margin: "24px 0 4px", color: BRAND }}>
          {model.auditTypeNameEn || "Audit Report"}
        </h1>
        <div style={{ ...arStyle, fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{model.auditTypeName}</div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700, width: 180 }}>Branch</td>
              <td style={{ ...td, ...arStyle, fontWeight: 700 }}>{model.branchName}</td>
            </tr>
            <tr>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>Branch Manager</td>
              <td style={td}>{model.branchManager || "—"}</td>
            </tr>
            <tr>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>Auditor</td>
              <td style={td}>{model.auditorName || "—"}</td>
            </tr>
            <tr>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>Audit Date</td>
              <td style={td}>{model.auditDate}</td>
            </tr>
            <tr>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>Report Version</td>
              <td style={td}>{model.version}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
          <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase" }}>Overall Percentage</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{result.overallPercentage}%</div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase" }}>General Deduction</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{result.generalDeductionPercentage}%</div>
          </div>
          <div
            style={{
              flex: 1.2,
              background: BRAND,
              color: "#ffffff",
              borderRadius: 8,
              padding: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, textTransform: "uppercase", color: LIME }}>Final Result</div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{result.finalPercentage}%</div>
          </div>
        </div>

        <h2 style={{ fontSize: 18, color: BRAND, borderBottom: `2px solid ${LIME}`, paddingBottom: 6 }}>Summary</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr>
              <th style={th}>Section</th>
              <th style={{ ...th, width: 90 }}>Score</th>
              <th style={{ ...th, width: 90 }}>Max</th>
              <th style={{ ...th, width: 110 }}>Percentage</th>
            </tr>
          </thead>
          <tbody>
            {result.sections
              .filter((section) => !section.excluded && !section.isDelivery)
              .map((section) => (
                <tr key={section.sectionId}>
                  <td style={{ ...td, ...arStyle }}>{section.nameAr}</td>
                  <td style={td}>{section.finalScore}</td>
                  <td style={td}>{section.max}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{section.percentage}%</td>
                </tr>
              ))}
            {result.delivery && (
              <tr>
                <td style={{ ...td, ...arStyle, background: "#f3f7f3" }}>
                  {result.delivery.nameAr}
                  <div style={{ direction: "ltr", textAlign: "left", fontSize: 10 }}>Delivery — scored separately</div>
                </td>
                <td style={{ ...td, background: "#f3f7f3" }}>{result.delivery.finalScore}</td>
                <td style={{ ...td, background: "#f3f7f3" }}>{result.delivery.max}</td>
                <td style={{ ...td, background: "#f3f7f3", fontWeight: 700 }}>{result.delivery.percentage}%</td>
              </tr>
            )}
            <tr>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>Overall (excluding Delivery)</td>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>{result.overallRawScore}</td>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>{result.overallMax}</td>
              <td style={{ ...td, background: OFFWHITE, fontWeight: 700 }}>{result.finalPercentage}%</td>
            </tr>
          </tbody>
        </table>

        {model.generalDeductions.length > 0 && (
          <div>
            <h3 style={{ fontSize: 14, color: BRAND }}>General Deductions</h3>
            {model.generalDeductions.map((deduction) => (
              <div key={deduction.id} style={{ ...arStyle, borderBottom: `1px solid ${LINE}`, padding: "4px 0" }}>
                {deduction.reasonText} — {deduction.percentage}%
              </div>
            ))}
          </div>
        )}
      </div>

      {/* One page per section */}
      {sections.map((section) => {
        const scores = resultById.get(section.id);
        return (
          <div key={section.id} style={page} data-report-page>
            <Header />
            <h2
              style={{
                ...arStyle,
                fontSize: 18,
                color: BRAND,
                borderBottom: `2px solid ${LIME}`,
                paddingBottom: 6,
                marginTop: 20,
              }}
            >
              {section.nameAr}
            </h2>
            {section.isDelivery && (
              <div style={{ fontSize: 11, marginBottom: 6 }}>Delivery section — scored separately</div>
            )}

            {section.groups.map((group) => (
              <div key={group.id ?? "ungrouped"} style={{ marginTop: 12 }}>
                {group.labelAr && (
                  <div style={{ ...arStyle, fontWeight: 700, color: BRAND, marginBottom: 6 }}>{group.labelAr}</div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <thead>
                    <tr>
                      <th style={th}>Question</th>
                      <th style={{ ...th, width: 80 }}>Score</th>
                      <th style={{ ...th, width: 180 }}>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.questions.map((question) => (
                      <tr key={question.id}>
                        <td style={{ ...td, ...arStyle, wordBreak: "break-word" }}>
                          <div style={{ direction: "ltr", textAlign: "left", fontSize: 10, color: "#6b7a6f" }}>
                            {question.itemId}
                          </div>
                          {question.textAr}
                        </td>
                        <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>
                          {scoreLabel(question)}
                          {question.isNa ? "" : ` / ${question.maxScore}`}
                        </td>
                        <td style={{ ...td, ...arStyle, wordBreak: "break-word" }}>{question.comment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {section.deductions.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>Internal deductions</div>
                {section.deductions.map((deduction) => (
                  <div key={deduction.id} style={arStyle}>
                    {deduction.reasonText} — {deduction.percentage}%
                  </div>
                ))}
              </div>
            )}

            {/* Section total */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
              <tbody>
                <tr>
                  <td style={{ ...td, background: BRAND, color: "#ffffff", fontWeight: 700 }}>Section Total</td>
                  <td style={{ ...td, background: OFFWHITE, fontWeight: 700, width: 110, textAlign: "center" }}>
                    {scores ? `${scores.finalScore} / ${scores.max}` : "—"}
                  </td>
                  <td style={{ ...td, background: LIME, fontWeight: 800, width: 110, textAlign: "center" }}>
                    {scores ? `${scores.percentage}%` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Photo appendix — grouped per section */}
      {photoSections.map((entry) => (
        <div key={`photos-${entry.section.id}`} style={page} data-report-page>
          <Header />
          <h2
            style={{
              fontSize: 18,
              color: BRAND,
              borderBottom: `2px solid ${LIME}`,
              paddingBottom: 6,
              marginTop: 20,
            }}
          >
            Photo Appendix
          </h2>
          <div style={{ ...arStyle, fontSize: 15, fontWeight: 800, color: BRAND, marginTop: 10 }}>
            {entry.section.nameAr}
          </div>
          {entry.questions.map((question) => (
            <div key={question.id} style={{ marginTop: 14 }}>
              <div style={{ ...arStyle, fontWeight: 700 }}>{question.textAr}</div>
              <div style={{ direction: "ltr", textAlign: "left", fontSize: 10, color: "#6b7a6f" }}>
                {question.itemId}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {question.photos.map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.url}
                    alt={`Audit evidence for item ${question.itemId}`}
                    crossOrigin="anonymous"
                    style={{ width: 210, height: 158, objectFit: "cover", border: `1px solid ${LINE}` }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 24, fontSize: 10, color: "#6b7a6f", borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
            Generated by SBAS · {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
      ))}
    </div>
  );
}
