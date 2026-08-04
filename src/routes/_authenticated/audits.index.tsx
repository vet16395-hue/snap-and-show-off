import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { FileText, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const searchSchema = z.object({
  status: z.enum(["all", "draft", "submitted"]).default("all"),
});

export const Route = createFileRoute("/_authenticated/audits/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "التدقيقات — SBAS" },
      { name: "description", content: "سجل تدقيقات سلامة الغذاء: المسودات والتدقيقات المكتملة." },
      { property: "og:title", content: "التدقيقات — SBAS" },
      { property: "og:description", content: "سجل تدقيقات فروع سعودي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditsList,
});

const filters = [
  { value: "all", label: "الكل" },
  { value: "draft", label: "مسودات" },
  { value: "submitted", label: "مكتملة" },
] as const;

function AuditsList() {
  const { status } = Route.useSearch();

  const { data: audits, isLoading } = useQuery({
    queryKey: ["audits", status],
    queryFn: async () => {
      let query = supabase
        .from("audits")
        .select("id, audit_date, status, branch_manager, branches(name_ar), audit_types(name_ar)")
        .order("audit_date", { ascending: false });
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;

      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell
      title="التدقيقات"
      subtitle="سجل التدقيقات الخاصة بك"
      action={
        <Button asChild>
          <Link to="/audits/new">تدقيق جديد</Link>
        </Button>
      }
    >
      <div className="mb-4 flex gap-2">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            asChild
            size="sm"
            variant={status === filter.value ? "default" : "outline"}
          >
            <Link to="/audits" search={{ status: filter.value }}>
              {filter.label}
            </Link>
          </Button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {!isLoading && (audits?.length ?? 0) === 0 && (
        <div className="surface-card p-10 text-center text-sm text-muted-foreground">
          لا توجد تدقيقات بعد.
        </div>
      )}

      <div className="grid gap-3">
        {audits?.map((audit) => {
          const branch = (audit.branches as { name_ar: string } | null)?.name_ar ?? "—";
          const type = (audit.audit_types as { name_ar: string } | null)?.name_ar ?? "—";
          const auditor = (audit.profiles as { full_name: string; email: string } | null);
          return (
            <div key={audit.id} className="surface-card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-40">
                <div className="text-base font-bold">{branch}</div>
                <div className="text-xs text-muted-foreground">
                  {type} · {audit.audit_date} · {auditor?.full_name || auditor?.email || ""}
                </div>
              </div>
              <Badge variant={audit.status === "draft" ? "outline" : "default"} className="ms-2">
                {audit.status === "draft" ? "مسودة" : "مكتمل"}
              </Badge>
              <div className="mr-auto flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/audits/$id" params={{ id: audit.id }}>
                    <PenLine className="size-4" /> فتح
                  </Link>
                </Button>
                {audit.status === "submitted" && (
                  <Button asChild size="sm">
                    <Link to="/audits/$id/report" params={{ id: audit.id }}>
                      <FileText className="size-4" /> التقرير
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
