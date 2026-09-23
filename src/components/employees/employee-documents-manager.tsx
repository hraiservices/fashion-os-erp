"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Upload, Trash2, FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { blobToDataUrl } from "@/lib/media";
import {
  useEmployeeDocuments,
  useSaveEmployeeKyc,
  useUploadEmployeeDocumentSlot,
  useAddEmployeeDocumentListItem,
  useDeleteEmployeeDocumentListItem,
  type DocumentSlot,
  type EmployeeDocumentListItem,
} from "@/hooks/use-employee-documents";

/** Masks everything but the last 4 characters — "XXXX XXXX 1234" style — with an explicit
 *  reveal toggle, since these are government ID numbers on a screen someone might be looking
 *  over the admin's shoulder at. */
function maskNumber(value: string): string {
  const visible = value.slice(-4);
  const hidden = value.slice(0, -4).replace(/[^\s]/g, "X");
  return `${hidden}${visible}`;
}

function MaskedNumberField({ label, value, saving, onSave }: { label: string; value: string | null; saving: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [revealed, setRevealed] = useState(false);

  if (editing) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-bold text-foreground/80">{label}</Label>
        <div className="flex gap-1">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9" autoFocus />
          <Button
            size="sm"
            disabled={saving}
            onClick={() => {
              onSave(draft.trim());
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold text-foreground/80">{label}</Label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-left text-sm font-mono hover:bg-muted/50"
          onClick={() => {
            setDraft(value || "");
            setEditing(true);
          }}
        >
          {value ? (revealed ? value : maskNumber(value)) : "+ add number"}
        </button>
        {value && (
          <Button size="icon-sm" variant="ghost" onClick={() => setRevealed((v) => !v)} aria-label={revealed ? "Hide" : "Reveal"}>
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function SingleFileUpload({ label, url, uploading, accept = "image/*,.pdf", onUpload }: { label: string; url: string | null; uploading: boolean; accept?: string; onUpload: (dataUrl: string) => void }) {
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) return toast.error("File is too large — max 5 MB");
    try {
      onUpload(await blobToDataUrl(file));
    } catch {
      toast.error("Could not read file");
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground/80">{label}</p>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              View current file
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Not uploaded</p>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={uploading} nativeButton={false} render={<label className="cursor-pointer" />}>
        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {url ? "Replace" : "Upload"}
        <input type="file" accept={accept} className="hidden" onChange={handleFile} disabled={uploading} />
      </Button>
    </div>
  );
}

function DocumentListSection({
  title,
  category,
  items,
  employeeId,
}: {
  title: string;
  category: "payslip" | "other";
  items: EmployeeDocumentListItem[];
  employeeId: string;
}) {
  const [label, setLabel] = useState("");
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const addItem = useAddEmployeeDocumentListItem(employeeId);
  const deleteItem = useDeleteEmployeeDocumentListItem(employeeId);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) return toast.error("File is too large — max 5 MB");
    try {
      setPendingFile(await blobToDataUrl(file));
    } catch {
      toast.error("Could not read file");
    }
  }

  async function handleAdd() {
    if (!pendingFile) return toast.error("Choose a file first");
    try {
      await addItem.mutateAsync({ category, label: label.trim() || (category === "payslip" ? "Payslip" : "Document"), file: pendingFile });
      setLabel("");
      setPendingFile(null);
      toast.success("Added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-foreground/80">{title}</p>
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <a href={d.url || "#"} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-primary hover:underline">
                {d.label || "Document"}
              </a>
              <Button
                size="icon-sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={deleteItem.isPending}
                onClick={() => deleteItem.mutateAsync(d.id).catch((e) => toast.error(e instanceof Error ? e.message : "Failed to delete"))}
                aria-label="Delete"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Label (e.g. March 2026)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 max-w-48" />
        <Button variant="outline" size="sm" nativeButton={false} render={<label className="cursor-pointer" />}>
          {pendingFile ? "File chosen" : "Choose file"}
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
        </Button>
        <Button size="sm" className="gap-1.5" disabled={!pendingFile || addItem.isPending} onClick={handleAdd}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}

/** Admin-only "Documents & KYC" section for one employee — Aadhaar/PAN numbers + images, the
 *  four single-file letter slots, and open-ended payslip-copy/other-document lists. Gated by
 *  the caller (employee-form.tsx checks role === "admin" before even rendering this), and
 *  every read/write here goes through the equally admin-gated /api/employees/[id]/documents*
 *  routes — never a direct table/bucket read. */
export function EmployeeDocumentsManager({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useEmployeeDocuments(employeeId, true);
  const saveKyc = useSaveEmployeeKyc(employeeId);
  const uploadSlot = useUploadEmployeeDocumentSlot(employeeId);
  const [uploadingSlot, setUploadingSlot] = useState<DocumentSlot | "aadhaar" | "pan" | null>(null);

  async function handleSlotUpload(slot: DocumentSlot, dataUrl: string) {
    setUploadingSlot(slot);
    try {
      await uploadSlot.mutateAsync({ slot, file: dataUrl });
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload");
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleKycImage(field: "aadhaarImage" | "panImage", dataUrl: string) {
    setUploadingSlot(field === "aadhaarImage" ? "aadhaar" : "pan");
    try {
      await saveKyc.mutateAsync({ [field]: dataUrl });
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload");
    } finally {
      setUploadingSlot(null);
    }
  }

  if (isLoading || !data) return <p className="py-2 text-xs text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MaskedNumberField
          label="Aadhaar Number"
          value={data.aadhaarNumber}
          saving={saveKyc.isPending}
          onSave={(v) => saveKyc.mutateAsync({ aadhaarNumber: v }).then(() => toast.success("Saved")).catch((e) => toast.error(e instanceof Error ? e.message : "Failed to save"))}
        />
        <MaskedNumberField
          label="PAN Number"
          value={data.panNumber}
          saving={saveKyc.isPending}
          onSave={(v) => saveKyc.mutateAsync({ panNumber: v }).then(() => toast.success("Saved")).catch((e) => toast.error(e instanceof Error ? e.message : "Failed to save"))}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SingleFileUpload label="Aadhaar Image" url={data.aadhaarImageUrl} accept="image/*" uploading={uploadingSlot === "aadhaar"} onUpload={(v) => handleKycImage("aadhaarImage", v)} />
        <SingleFileUpload label="PAN Image" url={data.panImageUrl} accept="image/*" uploading={uploadingSlot === "pan"} onUpload={(v) => handleKycImage("panImage", v)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SingleFileUpload label="Offer Letter" url={data.offerLetterUrl} uploading={uploadingSlot === "offer"} onUpload={(v) => handleSlotUpload("offer", v)} />
        <SingleFileUpload label="Relieving Letter" url={data.relievingLetterUrl} uploading={uploadingSlot === "relieving"} onUpload={(v) => handleSlotUpload("relieving", v)} />
        <SingleFileUpload label="Resignation Letter" url={data.resignationLetterUrl} uploading={uploadingSlot === "resignation"} onUpload={(v) => handleSlotUpload("resignation", v)} />
        <SingleFileUpload label="Experience Letter" url={data.experienceLetterUrl} uploading={uploadingSlot === "experience"} onUpload={(v) => handleSlotUpload("experience", v)} />
      </div>

      <DocumentListSection title="Signed Payslip Copies" category="payslip" items={data.payslips} employeeId={employeeId} />
      <DocumentListSection title="Other Documents" category="other" items={data.otherDocuments} employeeId={employeeId} />
    </div>
  );
}
