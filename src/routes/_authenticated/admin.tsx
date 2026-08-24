import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ChecklistManager } from "@/components/admin/ChecklistManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, MessageSquare, AlertOctagon, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  // إحصائيات الأقسام والفروع والكومنتات
  const sectionCommentStats = [
    { section: "قسم الأسماك", comments: 18, critical: 4, compliantRatio: "88%" },
    { section: "قسم الجزارة", comments: 24, critical: 7, compliantRatio: "82%" },
    { section: "قسم البقالة والأغذية الجافة", comments: 12, critical: 2, compliantRatio: "94%" },
    { section: "قسم الخضار والفاكهة", comments: 9, critical: 1, compliantRatio: "91%" },
    { section: "قسم الأجبان والمخللات", comments: 15, critical: 3, compliantRatio: "86%" },
    { section: "قسم المخبوزات والحلواني", comments: 6, critical: 0, compliantRatio: "96%" },
  ];

  const branchAudits = [
    { branch: "فرع الشيخ زايد", totalAudits: 14, lastScore: "94%", commentsCount: 22 },
    { branch: "فرع المهندسين", totalAudits: 19, lastScore: "87%", commentsCount: 31 },
    { branch: "فرع المعادي", totalAudits: 11, lastScore: "91%", commentsCount: 16 },
    { branch: "فرع التجمع الخامس", totalAudits: 16, lastScore: "95%", commentsCount: 15 },
  ];

  return (
    <AppShell title="لوحة التحكم الإدارية" subtitle="متابعة أداء الفروع وإحصائيات ملاحظات الأقسام">
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">نظرة عامة وإحصائيات الأقسام</TabsTrigger>
          <TabsTrigger value="branches">أداء الفروع</TabsTrigger>
          <TabsTrigger value="checklist">إدارة بنود التفتيش</TabsTrigger>
        </TabsList>

        {/* إحصائيات الكومنتات في الأقسام */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="surface-card p-4 text-center">
              <span className="text-xs text-muted-foreground">إجمالي الزيارات</span>
              <p className="text-2xl font-bold mt-1">60</p>
            </div>
            <div className="surface-card p-4 text-center">
              <span className="text-xs text-muted-foreground">إجمالي الملاحظات والكومنتات</span>
              <p className="text-2xl font-bold mt-1 text-primary">84</p>
            </div>
            <div className="surface-card p-4 text-center">
              <span className="text-xs text-muted-foreground">أكثر قسم به مخالفات</span>
              <p className="text-xl font-bold mt-1 text-destructive">قسم الجزارة</p>
            </div>
            <div className="surface-card p-4 text-center">
              <span className="text-xs text-muted-foreground">أعلى قسم التزاماً</span>
              <p className="text-xl font-bold mt-1 text-emerald-600">قسم المخبوزات</p>
            </div>
          </div>

          <div className="surface-card p-4 rounded-xl">
            <h3 className="text-base font-bold mb-3 flex items-center gap-2" dir="rtl">
              <MessageSquare className="size-5 text-primary" /> توزيع الكومنتات والمخالفات حسب القسم
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {sectionCommentStats.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border" dir="rtl">
                  <div>
                    <p className="font-bold text-sm">{item.section}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">نسبة الامتثال: {item.compliantRatio}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-destructive/10 text-destructive text-xs font-semibold px-2 py-1 rounded">
                      {item.critical} حرجة
                    </span>
                    <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded">
                      {item.comments} ملاحظة
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* أداء الفروع */}
        <TabsContent value="branches" className="space-y-3">
          <div className="surface-card p-4">
            <h3 className="text-base font-bold mb-3 flex items-center gap-2" dir="rtl">
              <Store className="size-5 text-primary" /> تقارير وملاحظات الفروع
            </h3>
            <div className="space-y-2">
              {branchAudits.map((b, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border" dir="rtl">
                  <div>
                    <span className="font-bold">{b.branch}</span>
                    <span className="text-xs text-muted-foreground mr-3">{b.totalAudits} زيارة مسجلة</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs">الملاحظات: <strong>{b.commentsCount}</strong></span>
                    <span className="font-bold text-sm text-primary">آخر تقييم: {b.lastScore}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="checklist">
          <ChecklistManager />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
