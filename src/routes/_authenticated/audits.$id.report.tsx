import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileArchive, FileText, History, Loader2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportDocument } from "@/components/report/ReportDocument";
import { loadReportModel } from "@/lib/report-data";
import { downloadBlob, generateReports, logAuditEdit, zipReports } from "@/lib/generate-reports";

export const Route = createFileRoute("/_authenticated/audits/$id/report")({
  head: () => ({
    meta: [
      { title: "Audit Report — SBAS" },
      { name: "description", content: "Final audit report with section scores, deductions, photos and PDF/Word export." },
      { property: "og:title", content: "Audit Report — SBAS" },
      { property: "og:description", content: "Seoudi branch audit report and exports." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "pdf" | "docx" | "zip">(null);
  const [reopening, setReopening] = useState(false);

  const { data: model, isLoading } = useQuery({
    queryKey: ["audit-report", id],
    queryFn: () => loadReportModel(id),
  });

  const { data: logs } = useQuery({
    queryKey: ["audit-logs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_edit_logs")
        .select("*")
        .eq("audit_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  if (isLoading || !model) {
    return (
      <AppShell title="Audit Report">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  const runExport = async (kind: "pdf" | "docx" | "zip") => {
    const node = printRef.current;
    if (!node) return;
    setBusy(kind);
    try {
      const report = await generateReports(model, node);
      if (kind === "pdf") downloadBlob(report.pdf, `${report.base}.pdf`);
      if (kind === "docx") downloadBlob(report.docx, `${report.base}.docx`);
      if (kind === "zip") downloadBlob(await zipReports(report), `${report.base}.zip`);
      await logAuditEdit(id, "report_generated", `${kind.toUpperCase()} v${model.version}`);
      toast.success("Report generated and archived");
    } catch (error) {
      console.error("report generation failed", error);
      toast.error(error instanceof Error ? error.message : "Could not generate the report");

    } finally {
      setBusy(null);
    }
  };

  const reopenAudit = async () => {
    setReopening(true);
    const nextVersion = (model.version ?? 1) + 1;
    const { error } = await supabase
      .from("audits")
      .update({ status: "draft", version: nextVersion, edited_at: new Date().toISOString() })
      .eq("id", id);
    setReopening(false);
    if (error) {
      toast.error("Could not reopen the audit");
      return;
    }
    await logAuditEdit(id, "reopened", `Reopened for editing as version ${nextVersion}`);
    queryClient.invalidateQueries({ queryKey: ["audit-report", id] });
    toast.success(`Audit reopened as version ${nextVersion}`);
    navigate({ to: "/audits/$id", params: { id } });
  };

  return (
    <AppShell
      title="Audit Report"
      subtitle={`${model.branchName} · ${model.auditDate} · v${model.version}`}
      action={
        <div className="flex flex-wrap gap-2">
          <Badge variant={model.status === "draft" ? "outline" : "default"}>
            {model.status === "draft" ? "Draft" : "Completed"}
          </Badge>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => runExport("pdf")}>
            {busy === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} PDF
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => runExport("docx")}>
            {busy === "docx" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Word
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => runExport("zip")}>
            {busy === "zip" ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />} Both (.zip)
          </Button>
          {model.status === "submitted" && (
            <Button variant="secondary" size="sm" disabled={reopening} onClick={reopenAudit}>
              {reopening ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />} Edit &amp; Resubmit
            </Button>
          )}
          {model.status === "draft" && (
            <Button asChild variant="secondary" size="sm">
              <Link to="/audits/$id/summary" params={{ id }}>
                Back to summary
              </Link>
            </Button>
          )}
        </div>
      }
    >
      <div className="overflow-x-auto rounded-2xl border border-border bg-white p-2">
        <div ref={printRef}>
          <ReportDocument model={model} />
        </div>
      </div>

      <div className="surface-card mt-4 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <History className="size-4" /> Audit trail
        </h3>
        <div className="mt-3 space-y-1.5 text-sm">
          {(logs?.length ?? 0) === 0 && <p className="text-muted-foreground">No recorded changes yet.</p>}
          {logs?.map((log) => (
            <div key={log.id} className="flex flex-wrap gap-2 border-b border-border pb-1.5 last:border-0">
              <span className="font-semibold">{log.action}</span>
              <span className="text-muted-foreground">{log.detail}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
