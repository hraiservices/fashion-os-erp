"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Download, Search, ExternalLink } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useCustomers } from "@/hooks/use-customers";
import { useRowSelection } from "@/hooks/use-row-selection";
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
const DEFAULT_TEMPLATE = "Hi {name}! 🎉 Check out our latest collection.";

/**
 * Bulk WhatsApp with an image — no API, no WhatsApp Business account, just wa.me click-to-chat
 * links (see bulk-whatsapp.ts's own comment on why). Distinct from /crm/broadcast, which sends
 * for real through the WhatsApp Cloud API (a paid, API-based setup) to a tag-based segment —
 * this instead: pick any customers by hand, upload one image, get one "Open Chat" link per
 * person with the caption pre-filled, then attach the image yourself inside each opened chat.
 * The image never leaves the browser — no upload, no server round-trip.
 */
export default function BulkWhatsAppPage() {
  const { data: user } = useCurrentUser();
  const { data: customers, isLoading } = useCustomers();
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const canSend = user?.perms.manageCustomers || user?.role === "admin" || user?.role === "manager";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = customers || [];
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q));
  }, [customers, search]);

  const selection = useRowSelection(filtered.map((c) => c.id));
  const selectedCustomers = useMemo(() => (customers || []).filter((c) => selection.selected.has(c.id)), [customers, selection.selected]);

  // A pure derivation of imageFile, not state of its own — the effect below only exists to
  // revoke the previous blob URL once React is done with it, never to compute this one.
  const imageUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

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
        description="Pick customers, upload one image, then open each chat and attach it yourself — no API, no WhatsApp Business account needed."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/crm" />}>
            <ArrowLeft className="size-4" /> Back to Customers
          </Button>
        }
      />

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="space-y-1.5">
          <Label className="text-sm font-bold">1. Image</Label>
          <p className="text-xs text-muted-foreground">
            Stays in your browser — nothing is uploaded anywhere. Download it if you need it on a different device (e.g. your phone) to attach from there.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="max-w-xs" />
            {imageUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- a transient blob: URL, not an app asset next/image can optimize */}
                <img src={imageUrl} alt="" className="size-16 rounded-lg border object-cover" />
                <a href={imageUrl} download={imageFile?.name || "whatsapp-image"} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <Download className="size-4" /> Download image
                </a>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-bold">2. Caption</Label>
          <Textarea
            rows={3}
            value={template}
            onChange={(e) => setTemplate(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="What do you want to say? Use {name} to personalize."
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
          <Label className="text-sm font-bold">4. Send — click each, then attach the image yourself</Label>
          <p className="text-xs text-muted-foreground">
            Every click opens a real WhatsApp chat with your caption already typed in — popup blockers stop an automatic loop, so this is one click per person, same as the rest of this app&apos;s WhatsApp buttons.
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
          {imageUrl && (
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <ExternalLink className="size-3.5" /> Remember to attach the image (📎 in the chat) before hitting send in WhatsApp.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
