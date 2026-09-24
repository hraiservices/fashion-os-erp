"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ImagePlus, Search, Copy, Check, Link2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useCustomers } from "@/hooks/use-customers";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useCreateWhatsAppGallery, fileToDataUrl } from "@/hooks/use-whatsapp-gallery";
import { buildBulkWhatsAppUrl, applyNameTemplate } from "@/lib/bulk-whatsapp";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";

const MAX_MESSAGE_LENGTH = 900;
const MAX_IMAGES = 10;
const DEFAULT_TEMPLATE = "Hi {name}! 🎉 Check out our latest collection: {link}";

/**
 * Bulk WhatsApp with an image — no WhatsApp API, no Business account. Upload once, get a public
 * link with a real photo-preview thumbnail (see /api/whatsapp-gallery), drop the link into a
 * caption, then open one wa.me click-to-chat per selected customer with that caption pre-filled
 * — you only click Send inside each chat, nothing to attach by hand. Distinct from
 * /crm/broadcast, which sends for real through the WhatsApp Cloud API to a tag-based segment.
 */
export default function BulkWhatsAppPage() {
  const { data: user } = useCurrentUser();
  const { data: customers, isLoading } = useCustomers();
  const createGallery = useCreateWhatsAppGallery();
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [galleryUrl, setGalleryUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canSend = user?.perms.manageCustomers || user?.role === "admin" || user?.role === "manager";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = customers || [];
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q));
  }, [customers, search]);

  const selection = useRowSelection(filtered.map((c) => c.id));
  const selectedCustomers = useMemo(() => (customers || []).filter((c) => selection.selected.has(c.id)), [customers, selection.selected]);

  function handleFilesChosen(files: FileList | null) {
    setImageFiles(Array.from(files || []).slice(0, MAX_IMAGES));
    setGalleryUrl(null);
  }

  async function handleGenerateLink() {
    try {
      const dataUrls = await Promise.all(imageFiles.map(fileToDataUrl));
      const { url } = await createGallery.mutateAsync({ images: dataUrls });
      setGalleryUrl(url);
      // {link} in the caption is replaced right here, once, rather than at send time — so what's
      // shown in the preview/send list below always matches exactly what a customer will see.
      setTemplate((t) => (t.includes("{link}") ? t.replace(/\{link\}/g, url) : `${t.trim()} ${url}`.trim()));
      toast.success("Link ready — inserted into your caption below.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create link");
    }
  }

  async function handleCopyLink() {
    if (!galleryUrl) return;
    await navigator.clipboard.writeText(galleryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!canSend) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={ImagePlus} title="No access" description="Bulk WhatsApp is restricted to users who can manage customers." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Bulk WhatsApp with Image"
        description="Upload photos, get a link with a preview thumbnail, then send it to any customers you pick — no API, no WhatsApp Business account needed."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/crm" />}>
            <ArrowLeft className="size-4" /> Back to Customers
          </Button>
        }
      />

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label className="text-sm font-bold">1. Photos (up to {MAX_IMAGES})</Label>
          <p className="text-xs text-muted-foreground">Uploaded to a private link only you and whoever opens it can see — not indexed, not public elsewhere.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Input type="file" accept="image/*" multiple onChange={(e) => handleFilesChosen(e.target.files)} className="max-w-xs" />
            <Button onClick={handleGenerateLink} disabled={imageFiles.length === 0 || createGallery.isPending}>
              <Link2 className="size-4" /> {createGallery.isPending ? "Generating…" : "Generate Link"}
            </Button>
          </div>
          {imageFiles.length > 0 && <p className="text-xs text-muted-foreground">{imageFiles.length} photo{imageFiles.length === 1 ? "" : "s"} selected</p>}
          {galleryUrl && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
              <a href={galleryUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline">
                {galleryUrl}
              </a>
              <Button variant="outline" size="sm" onClick={handleCopyLink}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-bold">2. Caption</Label>
          <Textarea
            rows={3}
            value={template}
            onChange={(e) => setTemplate(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="What do you want to say? Use {name} to personalize, {link} for where the photo link goes."
          />
          <p className="text-right text-[11px] text-muted-foreground">{template.length}/{MAX_MESSAGE_LENGTH}</p>
          {template && <p className="rounded-lg bg-muted/40 p-2 text-xs italic text-muted-foreground">Preview: {applyNameTemplate(template, "Priya")}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-bold">3. Customers ({selection.count} selected)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No customers match.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
              <label className="flex items-center gap-2 border-b px-2 py-1.5 text-sm font-medium">
                <Checkbox checked={selection.allSelected} ref={(el) => { if (el) el.indeterminate = selection.someSelected; }} onChange={selection.toggleAll} />
                Select all ({filtered.length})
              </label>
              {filtered.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                  <Checkbox checked={selection.selected.has(c.id)} onChange={() => selection.toggle(c.id)} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.mobile}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {selection.count > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-5">
          <Label className="text-sm font-bold">4. Send — one click opens the chat, already typed in</Label>
          <p className="text-xs text-muted-foreground">
            Popup blockers stop an automatic loop, so this is one click per person to open their chat — the caption (with the photo link) is already filled in, you just tap Send inside WhatsApp.
          </p>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {selectedCustomers.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.mobile}</p>
                </div>
                <WhatsAppButton href={buildBulkWhatsAppUrl(c.mobile, c.name, template || DEFAULT_TEMPLATE)} label="Open Chat" size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
