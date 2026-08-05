import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FilePlus2, FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SBAS" },
      { name: "description", content: "Auditor dashboard: start a new audit, resume drafts and review completed audits." },
      { property: "og:title", content: "Dashboard — SBAS" },
      { property: "og:description", content: "Manage Seoudi branch food safety audits." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile } = useSession();

  const { data: counts } = useQuery({
    queryKey: ["audit-counts"],
    queryFn: async () => {
      const [drafts, submitted] = await Promise.all([
        supabase.from("audits").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("audits").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      ]);
      return { drafts: drafts.count ?? 0, submitted: submitted.count ?? 0 };
    },
  });

  const cards = [
    {
      to: "/audits/new" as const,
      icon: FilePlus2,
      title: "New Audit",
      body: "Start a new audit for a branch",
      value: "",
      primary: true,
    },
    {
      to: "/audits" as const,
      search: { status: "draft" as const },
      icon: ClipboardList,
      title: "Draft Audits",
      body: "Resume audits still in progress",
      value: String(counts?.drafts ?? 0),
    },
    {
      to: "/audits" as const,
      search: { status: "submitted" as const },
      icon: FileCheck2,
      title: "Completed Audits",
      body: "Review results and generate reports",
      value: String(counts?.submitted ?? 0),
    },
  ];

  return (
    <AppShell title={`Welcome, ${profile?.full_name || profile?.email || ""}`} subtitle="What would you like to do?">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.title}
            to={card.to}
            search={card.search as never}
            className={
              card.primary
                ? "brand-banner flex flex-col rounded-2xl p-6 shadow-[var(--shadow-raised)] transition-transform active:scale-[0.99]"
                : "surface-card flex flex-col p-6 transition-transform active:scale-[0.99]"
            }
          >
            <card.icon className={card.primary ? "size-8" : "size-8 text-primary"} />
            <span className="mt-4 text-lg font-bold">{card.title}</span>
            <span className={card.primary ? "text-sm opacity-85" : "text-sm text-muted-foreground"}>
              {card.body}
            </span>
            {card.value && <span className="mt-4 text-3xl font-extrabold">{card.value}</span>}
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
