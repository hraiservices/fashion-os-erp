"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ScanLine, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScanBill, type BillScanDraft } from "@/hooks/use-bill-scan";
import { BILL_SCAN_ACCEPT, BILL_SCAN_MAX_BYTES } from "@/lib/purchase-bill-scan";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Upload a photo/PDF of a vendor bill and have AI pre-fill the New Bill form below — nothing is
 *  saved here, the draft just prefills BillForm's own fields for the usual review-and-save flow. */
export function BillScanUpload({ onExtracted }: { onExtracted: (draft: BillScanDraft, scanPath: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const scanBill = useScanBill();

  async function handleFile(file: File) {
    if (file.size > BILL_SCAN_MAX_BYTES) {
      toast.error(`That file is over ${Math.round(BILL_SCAN_MAX_BYTES / 1024 / 1024)} MB — try a smaller photo or a compressed PDF`);
      return;
    }
    setFileName(file.name);
    try {
      const base64 = await readAsBase64(file);
      const res = await scanBill.mutateAsync({ base64, contentType: file.type || "application/octet-stream", fileName: file.name });
      const matched = res.draft.items.filter((i) => i.itemId).length;
      const total = res.draft.items.length;
      toast.success(
        total > 0
          ? `Read the bill — ${matched}/${total} item${total === 1 ? "" : "s"} matched automatically. Review and adjust below before saving.`
          : "Read the bill. Review the fields below before saving."
      );
      onExtracted(res.draft, res.scanPath);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that bill");
      setFileName(null);
    }
  }

  return (
    <div className="rounded-xl border border-dashed bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ScanLine className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Scan a bill</p>
          <p className="text-xs text-muted-foreground">
            {fileName && scanBill.isPending ? `Reading ${fileName}…` : "Upload a photo or PDF of the vendor's bill — AI fills in the form below for you to check."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => inputRef.current?.click()} disabled={scanBill.isPending}>
          {scanBill.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Reading…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" /> Upload bill
            </>
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={BILL_SCAN_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
