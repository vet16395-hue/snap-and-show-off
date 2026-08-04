import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/audits/new")({
  head: () => ({
    meta: [
      { title: "تدقيق جديد — SBAS" },
      { name: "description", content: "إنشاء تدقيق جديد: اختر الفرع، نوع التدقيق، التاريخ والمدقق." },
      { property: "og:title", content: "تدقيق جديد — SBAS" },
      { property: "og:description", content: "إنشاء تدقيق جديد لأحد فروع سعودي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewAudit;
});

function NewAudit() {
  return null;
}
