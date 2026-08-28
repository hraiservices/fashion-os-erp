"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_INVOICE_TERMS } from "@/lib/invoice-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Shop-wide default Terms & Conditions — pre-filled onto every new sales invoice, still editable per-invoice. */
export function InvoiceTermsSection() {
  const { data, isLoading, save } = useAppSetting<string>("invoiceTerms", DEFAULT_INVOICE_TERMS);
  const [terms, setTerms] = useState(DEFAULT_INVOICE_TERMS);

  useSyncFromSource(data, (d) => {
    if (d != null) setTerms(d);
  });

  async function onSave() {
    try {
      await save.mutateAsync(terms);
      toast.success("Default invoice terms saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Default invoice terms & conditions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea rows={6} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, return policy, jurisdiction…" />
        <Button disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
