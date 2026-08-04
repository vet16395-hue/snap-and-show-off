import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, BarChart3, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SBAS — نظام تدقيق فروع سعودي" },
      {
        name: "description",
        content:
          "نظام تدقيق سلامة الغذاء لفروع سعودي: قائمة فحص ديناميكية موزونة، احتساب درجات دقيق، وتقارير ثنائية اللغة.",
      },
      { property: "og:title", content: "SBAS — نظام تدقيق فروع سعودي" },
      {
        property: "og:description",
        content: "قائمة فحص ديناميكية، احتساب درجات آلي، وتقارير احترافية لفروع سعودي ماركت.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: ClipboardCheck, title: "قائمة فحص ديناميكية", body: "أقسام وعناوين وأسئلة تُدار من لوحة الإدارة أو تُستورد من ملف Excel." },
  { icon: BarChart3, title: "احتساب درجات دقيق", body: "خصومات داخلية لكل قسم، خصم عام على النتيجة النهائية، وقسم التوصيل معزول تماماً." },
  { icon: FileText, title: "تقارير احترافية", body: "تقرير PDF وملف Word بنفس التنسيق مع الصور والملاحظات لكل سؤال." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="brand-banner">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground text-lg font-bold">
            S
          </span>
          <div className="text-sm font-semibold leading-tight">
            نظام تدقيق فروع سعودي
            <span className="block text-[11px] font-normal opacity-80">Seoudi Branches Audit System</span>
          </div>
          <div className="mr-auto">
            <Button asChild variant="secondary" size="sm">
              <Link to="/auth">تسجيل الدخول</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-14 text-center sm:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <ShieldCheck className="size-3.5" /> سلامة الغذاء · 31 فرعاً
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-5xl">
            تدقيق فروع سعودي، من الأرض مباشرة
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            أداة ميدانية للمدققين: قسم واحد في كل شاشة، أزرار كبيرة للتقييم، حفظ تلقائي كمسودة، ونتيجة
            نهائية محسوبة تلقائياً وفق قواعد سعودي.
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">ابدأ التدقيق</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="surface-card p-5">
              <feature.icon className="size-6 text-primary" />
              <h2 className="mt-3 text-base font-bold">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
