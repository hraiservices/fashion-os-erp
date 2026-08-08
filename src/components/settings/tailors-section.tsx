"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** SettingsView section === "tailors", Stitching_Manager_Pro_v16.html ~line 12753. */
export function TailorsSection() {
  const { data: tailors, isLoading, save } = useAppSetting<string[]>("tailors", []);
  const [newTailor, setNewTailor] = useState("");

  async function addTailor() {
    const name = newTailor.trim();
    if (!name) return;
    try {
      await save.mutateAsync([...(tailors || []), name]);
      setNewTailor("");
      toast.success("Tailor added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add tailor");
    }
  }

  async function removeTailor(index: number) {
    try {
      await save.mutateAsync((tailors || []).filter((_, i) => i !== index));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove tailor");
    }
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Tailors ({(tailors || []).length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Tailor name" value={newTailor} onChange={(e) => setNewTailor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTailor()} />
          <Button onClick={addTailor} disabled={save.isPending}>
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {(tailors || []).map((t, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{t}</span>
              <Button variant="ghost" size="sm" onClick={() => removeTailor(i)}><X className="size-4" /></Button>
            </div>
          ))}
          {(tailors || []).length === 0 && <p className="text-sm text-muted-foreground">No tailors added yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
