import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ChecklistManager } from "@/components/admin/ChecklistManager";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SBAS" },
      { name: "description", content: "Manage branches, auditors, audit types and the audit checklists." },
      { property: "og:title", content: "Admin — SBAS" },
      { property: "og:description", content: "Administration console for the Seoudi Branches Audit System." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin } = useSession();
  const queryClient = useQueryClient();
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-data"],
    queryFn: async () => {
      const [branches, profiles] = await Promise.all([
        supabase.from("branches").select("*").order("name_ar"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      return { branches: branches.data ?? [], profiles: profiles.data ?? [] };
    },
  });

  if (!isAdmin) {
    return (
      <AppShell title="Admin">
        <div className="surface-card p-8 text-center text-sm text-muted-foreground">
          This page is available to system administrators only.
        </div>
      </AppShell>
    );
  }

  const addBranch = async () => {
    if (!branchName.trim() || !branchCode.trim()) {
      toast.error("Enter the branch name and code");
      return;
    }
    const { error } = await supabase
      .from("branches")
      .insert({ name_ar: branchName.trim().slice(0, 120), code: branchCode.trim().slice(0, 40) });
    if (error) {
      toast.error("Could not add the branch");
      return;
    }
    setBranchName("");
    setBranchCode("");
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  };

  return (
    <AppShell title="Admin" subtitle="Checklists, audit types, branches and users">
      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="types">Audit Types</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="pt-4">
          <ChecklistManager />
        </TabsContent>

        <TabsContent value="types" className="pt-4">
          <AuditTypesManager />
        </TabsContent>

        <TabsContent value="branches" className="space-y-3 pt-4">
          <div className="surface-card flex flex-wrap items-end gap-2 p-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="bname">Branch name</Label>
              <Input id="bname" value={branchName} onChange={(event) => setBranchName(event.target.value)} />
            </div>
            <div className="w-32 space-y-1.5">
              <Label htmlFor="bcode">Code</Label>
              <Input id="bcode" value={branchCode} onChange={(event) => setBranchCode(event.target.value)} />
            </div>
            <Button onClick={addBranch}>Add</Button>
          </div>

          <div className="grid gap-2">
            {data?.branches.map((branch) => (
              <div key={branch.id} className="surface-card flex items-center gap-3 p-3 text-sm">
                <span className="font-semibold" dir="rtl">{branch.name_ar}</span>
                <span className="text-muted-foreground">{branch.code}</span>
                <div className="ml-auto flex items-center gap-3">
                  <Switch
                    checked={branch.active}
                    onCheckedChange={async (value) => {
                      await supabase.from("branches").update({ active: value }).eq("id", branch.id);
                      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
                    }}
                  />
                  <button
                    aria-label="Delete branch"
                    onClick={async () => {
                      await supabase.from("branches").delete().eq("id", branch.id);
                      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-2 pt-4">
          {data?.profiles.map((profile) => (
            <div key={profile.id} className="surface-card flex items-center gap-3 p-3 text-sm">
              <span className="font-semibold">{profile.full_name || "—"}</span>
              <span className="text-muted-foreground">{profile.email}</span>
              <Switch
                className="ml-auto"
                checked={profile.active}
                onCheckedChange={async (value) => {
                  await supabase.from("profiles").update({ active: value }).eq("id", profile.id);
                  queryClient.invalidateQueries({ queryKey: ["admin-data"] });
                }}
              />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function AuditTypesManager() {
  const queryClient = useQueryClient();
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name_ar: "", name_en: "", code: "", description: "" });

  const { data: types } = useQuery({
    queryKey: ["audit-types-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_types").select("*").order("created_at");
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["audit-types-admin"] });
    queryClient.invalidateQueries({ queryKey: ["checklist"] });
    queryClient.invalidateQueries({ queryKey: ["audit-types"] });
  };

  const create = async () => {
    if (!nameAr.trim() || !nameEn.trim() || !code.trim()) {
      toast.error("Enter the Arabic name, English name and code");
      return;
    }
    const { error } = await supabase.from("audit_types").insert({
      name_ar: nameAr.trim().slice(0, 120),
      name_en: nameEn.trim().slice(0, 120),
      code: code.trim().slice(0, 40),
      description: description.trim().slice(0, 300),
    });
    if (error) {
      toast.error("Could not create the audit type (the code must be unique)");
      return;
    }
    setNameAr("");
    setNameEn("");
    setCode("");
    setDescription("");
    toast.success("Audit type created");
    refresh();
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("audit_types")
      .update({
        name_ar: draft.name_ar.trim().slice(0, 120),
        name_en: draft.name_en.trim().slice(0, 120),
        code: draft.code.trim().slice(0, 40),
        description: draft.description.trim().slice(0, 300),
      })
      .eq("id", id);
    if (error) {
      toast.error("Could not save the audit type");
      return;
    }
    setEditingId(null);
    refresh();
  };

  const remove = async (id: string) => {
    const { count } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .eq("audit_type_id", id);
    if ((count ?? 0) > 0) {
      const { error } = await supabase.from("audit_types").update({ active: false }).eq("id", id);
      if (error) {
        toast.error("Could not deactivate the audit type");
        return;
      }
      toast.success("Audit type has existing audits — deactivated instead of deleted");
      refresh();
      return;
    }
    const { error } = await supabase.from("audit_types").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete the audit type — remove its checklist first");
      return;
    }
    toast.success("Audit type deleted");
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="surface-card grid gap-3 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tname-ar">Name (Arabic)</Label>
          <Input id="tname-ar" dir="rtl" value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tname-en">Name (English)</Label>
          <Input id="tname-en" value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tcode">Code</Label>
          <Input id="tcode" value={code} onChange={(event) => setCode(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tdesc">Description</Label>
          <Input id="tdesc" value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div>
          <Button onClick={create}>Add audit type</Button>
        </div>
      </div>

      <div className="grid gap-2">
        {types?.map((type) =>
          editingId === type.id ? (
            <div key={type.id} className="surface-card grid gap-2 p-3 sm:grid-cols-2">
              <Input dir="rtl" value={draft.name_ar} onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} />
              <Input value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} />
              <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveEdit(type.id)}>
                  <Check className="size-4" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                  <X className="size-4" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div key={type.id} className="surface-card flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-semibold" dir="rtl">
                {type.name_ar}
              </span>
              <span className="text-muted-foreground">{type.name_en}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{type.code}</span>
              {type.description && <span className="text-xs text-muted-foreground">{type.description}</span>}
              <div className="ml-auto flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${type.id}`} className="text-xs text-muted-foreground">
                    Active
                  </Label>
                  <Switch
                    id={`active-${type.id}`}
                    checked={type.active}
                    onCheckedChange={async (value) => {
                      await supabase.from("audit_types").update({ active: value }).eq("id", type.id);
                      refresh();
                    }}
                  />
                </div>
                <button
                  aria-label="Edit audit type"
                  onClick={() => {
                    setEditingId(type.id);
                    setDraft({
                      name_ar: type.name_ar,
                      name_en: type.name_en ?? "",
                      code: type.code,
                      description: type.description ?? "",
                    });
                  }}
                >
                  <Pencil className="size-4" />
                </button>
                <button aria-label="Delete audit type" onClick={() => remove(type.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
