import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { FileText, PenLine, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logAuditEdit } from "@/lib/generate-reports";

const searchSchema = z.object({
  status: z.enum(["all", "draft", "submitted"]).default("all"),
});

export const Route = createFileRoute("/_authenticated/audits/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Audits — SBAS" },
      { name: "description", content: "Food safety audit history: drafts in progress and completed audits." },
      { property: "og:title", content: "Audits — SBAS" },
      { property: "og:description", content: "Seoudi branch audit records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditsList,
});

const filters = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "submitted", label: "Completed" },
] as const;

function AuditsList() {
  const { status } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: audits, isLoading } = useQuery({
    queryKey: ["audits", status],
    queryFn: async () => {
      let query = supabase
        .from("audits")
        .select("id, audit_date, status, version, branch_manager, branches(name_ar), audit_types(name_ar)")
        .order("audit_date", { ascending: false });
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const reopen = async (auditId: string, version: number) => {
    const nextVersion = (version ?? 1) + 1;
    const { error } = await supabase
      .from("audits")
      .update({ status: "draft", version: nextVersion, edited_at: new Date().toISOString() })
      .eq("id", auditId);
    if (error) {
      toast.error("Could not reopen the audit");
      return;
    }
    await logAuditEdit(auditId, "reopened", `Reopened for editing as version ${nextVersion}`);
    queryClient.invalidateQueries({ queryKey: ["audits"] });
    navigate({ to: "/audits/$id", params: { id: auditId } });
  };

  const removeAudit = async (auditId: string) => {
    const { error } = await supabase.from("audits").delete().eq("id", auditId);
    if (error) {
      toast.error("Could not delete the audit");
      return;
    }
    toast.success("Audit deleted");
    queryClient.invalidateQueries({ queryKey: ["audits"] });
  };

  return (
    <AppShell
      title="Audits"
      subtitle="Your audit records"
      action={
        <Button asChild>
          <Link to="/audits/new">New audit</Link>
        </Button>
      }
    >
      <div className="mb-4 flex gap-2">
        {filters.map((filter) => (
          <Button key={filter.value} asChild size="sm" variant={status === filter.value ? "default" : "outline"}>
            <Link to="/audits" search={{ status: filter.value }}>
              {filter.label}
            </Link>
          </Button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (audits?.length ?? 0) === 0 && (
        <div className="surface-card p-10 text-center text-sm text-muted-foreground">No audits yet.</div>
      )}

      <div className="grid gap-3">
        {audits?.map((audit) => {
          const branch = (audit.branches as { name_ar: string } | null)?.name_ar ?? "—";
          const type = (audit.audit_types as { name_ar: string } | null)?.name_ar ?? "—";
          const isDraft = audit.status === "draft";
          return (
            <div key={audit.id} className="surface-card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-40" dir="rtl">
                <div className="text-base font-bold">{branch}</div>
                <div className="text-xs text-muted-foreground">
                  {type} · <span dir="ltr">{audit.audit_date}</span>
                </div>
              </div>
              <Badge variant={isDraft ? "outline" : "default"}>{isDraft ? "Draft" : "Completed"}</Badge>
              {(audit.version ?? 1) > 1 && <span className="text-xs text-muted-foreground">v{audit.version}</span>}
              <div className="ml-auto flex flex-wrap gap-2">
                {isDraft ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/audits/$id" params={{ id: audit.id }}>
                      <PenLine className="size-4" /> Resume
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => reopen(audit.id, audit.version ?? 1)}>
                    <PenLine className="size-4" /> Edit &amp; Resubmit
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to="/audits/$id/summary" params={{ id: audit.id }}>
                    Summary
                  </Link>
                </Button>
                {!isDraft && (
                  <Button asChild size="sm">
                    <Link to="/audits/$id/report" params={{ id: audit.id }}>
                      <FileText className="size-4" /> Report
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete audit"
                  onClick={() => removeAudit(audit.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
