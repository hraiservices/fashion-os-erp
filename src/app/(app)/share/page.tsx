"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Paperclip, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchSelect } from "@/components/ui/search-select";
import { BackLink } from "@/components/ui/back-link";
import { errorData, useCreateLead, useLeads, useTargetsMeta } from "@/hooks/use-targets";
import { describeSummary, useAttachToLead } from "@/hooks/use-lead-whatsapp";
import { LEAD_MEDIA_MAX_BYTES, formatBytes, guessContentType, leadMediaKind } from "@/lib/lead-media";
import { looksLikeChatExport } from "@/lib/whatsapp-export";

const SHARE_CACHE = "fashion-flow-share";

interface Shared {
  files: File[];
  text: string;
}

/** Reads back whatever the service worker parked when WhatsApp shared into the app (see public/sw.js). */
async function readShared(): Promise<Shared> {
  if (typeof caches === "undefined") return { files: [], text: "" };
  try {
    const cache = await caches.open(SHARE_CACHE);
    const metaRes = await cache.match("/__shared/meta");
    if (!metaRes) return { files: [], text: "" };
    const meta = (await metaRes.json()) as { text?: string; title?: string; url?: string; count?: number };
    const files: File[] = [];
    for (let i = 0; i < (meta.count ?? 0); i++) {
      const res = await cache.match(`/__shared/${i}`);
      if (!res) continue;
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get("X-File-Name") || `file-${i}`);
      files.push(new File([blob], name, { type: blob.type }));
    }
    return { files, text: (meta.text || "").trim() };
  } catch {
    return { files: [], text: "" };
  }
}

async function clearShared() {
  try {
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
  } catch {
    // nothing parked, or storage unavailable
  }
}

function acceptable(f: File): string | null {
  if (looksLikeChatExport(f)) return null;
  if (f.size > LEAD_MEDIA_MAX_BYTES) return "over 25 MB";
  if (!leadMediaKind(guessContentType(f.name, f.type))) return "not a supported type";
  return null;
}

/**
 * "Share to Fashion Flow": where files shared from WhatsApp land. Pick the lead (or add a new one), and the
 * photos, voice notes, designs, PDFs, a chat export and any shared text go onto it in one step.
 */
export default function SharePage() {
  const router = useRouter();
  const meta = useTargetsMeta().data;
  const leadsQuery = useLeads({ limit: 500 });
  const attach = useAttachToLead();
  const createLead = useCreateLead();
  const inputRef = useRef<HTMLInputElement>(null);

  const [shared, setShared] = useState<Shared | null>(null);
  const [leadId, setLeadId] = useState("");
  const [saveText, setSaveText] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");

  useEffect(() => {
    let alive = true;
    readShared().then((s) => alive && setShared(s));
    return () => {
      alive = false;
    };
  }, []);

  const leads = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data]);
  const options = useMemo(() => leads.map((l) => ({ value: l.id, label: l.name, sublabel: l.mobile || undefined })), [leads]);
  const leadName = leads.find((l) => l.id === leadId)?.name ?? "";

  if (!shared) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />;
  const canManage = !meta || !!meta.can.manageLeads;
  const hasChatExport = shared.files.some(looksLikeChatExport);
  const usable = shared.files.filter((f) => !acceptable(f));
  const nothing = shared.files.length === 0 && !shared.text;
  const willSaveText = !!shared.text && saveText;
  const canSave = !!leadId && (usable.length > 0 || willSaveText) && !attach.isPending;

  function addPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length) setShared((s) => ({ files: [...(s?.files ?? []), ...picked], text: s?.text ?? "" }));
  }

  function removeFile(i: number) {
    setShared((s) => (s ? { ...s, files: s.files.filter((_, j) => j !== i) } : s));
  }

  async function addLead() {
    try {
      const r = await createLead.mutateAsync({ name: newName.trim(), mobile: newMobile.trim(), source: "WhatsApp" });
      if (r.id) setLeadId(r.id);
      setAdding(false);
      setNewName("");
      setNewMobile("");
    } catch (e) {
      // A lead already open for this number: use that one instead of making a second.
      const dup = errorData(e).duplicateOf;
      if (typeof dup === "string") {
        setLeadId(dup);
        setAdding(false);
        toast.info("This number already has a lead — using it");
      } else {
        toast.error(e instanceof Error ? e.message : "Couldn't add the lead");
      }
    }
  }

  function save() {
    if (!canSave) return;
    attach.mutate(
      { id: leadId, files: usable, text: willSaveText ? shared!.text : undefined },
      {
        onSuccess: async (s) => {
          s.failures.forEach((f) => toast.error(f));
          toast.success(describeSummary(s));
          await clearShared();
          router.push(`/targets/leads/${leadId}`);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
      }
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10 sm:p-6">
      <BackLink href="/targets?tab=leads">Leads</BackLink>
      <div className="flex items-center gap-2">
        <Share2 className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Add to a lead</h1>
      </div>

      {!canManage ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">You don&apos;t have permission to add things to leads.</p>
      ) : (
        <>
          {nothing && (
            <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Nothing shared yet</p>
              <p>In WhatsApp, open the chat, select the photos or voice notes (long-press), tap Share, and choose Fashion Flow. Or use the button below to pick files from this phone.</p>
              <p>To bring a whole conversation, open the chat → ⋮ → More → Export chat, then share the file to Fashion Flow.</p>
            </div>
          )}

          <input ref={inputRef} type="file" multiple accept="image/*,audio/*,video/*,application/pdf,.pdf,.zip,.txt,.opus" className="hidden" onChange={addPicked} />

          {shared.files.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-sm font-semibold text-muted-foreground">Files ({shared.files.length})</h2>
              <ul className="divide-y rounded-xl border bg-card">
                {shared.files.map((f, i) => {
                  const problem = acceptable(f);
                  return (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-1">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{f.name}</p>
                        <p className={problem ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                          {problem ? `Will be skipped — ${problem}` : looksLikeChatExport(f) ? `WhatsApp chat export · ${formatBytes(f.size)}` : formatBytes(f.size)}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`} className="inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground">
                        <X className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasChatExport && <p className="px-1 text-xs text-muted-foreground">The chat export is unpacked: its photos, voice notes and documents become attachments, and the conversation goes into History.</p>}
            </section>
          )}

          {shared.text && (
            <section className="space-y-2 rounded-xl border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">Shared text</p>
              <p className="line-clamp-5 whitespace-pre-wrap text-sm">{shared.text}</p>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={saveText} onChange={(e) => setSaveText(e.target.checked)} className="size-4 accent-primary" />
                Save this text in the lead&apos;s History
              </label>
            </section>
          )}

          <Button type="button" variant="outline" className="h-12 w-full" onClick={() => inputRef.current?.click()}>
            <Paperclip className="size-4" /> Choose files from this phone
          </Button>

          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold text-muted-foreground">Which lead?</h2>
            <SearchSelect
              className="w-full"
              inputClassName="h-12"
              placeholder="Type a name or number…"
              value={leadId}
              fallbackLabel={leadName}
              options={options}
              onSelect={setLeadId}
              createActions={[{ label: "Add new lead", onCreate: (q) => { setNewName(/\d{5,}/.test(q) ? "" : q); setNewMobile(/\d{5,}/.test(q) ? q : ""); setAdding(true); } }]}
            />
            {adding && (
              <div className="space-y-2 rounded-xl border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">New lead</p>
                <Input autoFocus placeholder="Name" className="h-11" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Input type="tel" inputMode="tel" placeholder="Mobile number" className="h-11" value={newMobile} onChange={(e) => setNewMobile(e.target.value)} />
                <div className="flex gap-2">
                  <Button type="button" className="h-11 flex-1" disabled={!newName.trim() || createLead.isPending} onClick={addLead}>
                    {createLead.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Add &amp; select
                  </Button>
                  <Button type="button" variant="ghost" className="h-11" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </section>

          <Button type="button" className="h-12 w-full" disabled={!canSave} onClick={save}>
            {attach.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              <>{leadName ? `Save to ${leadName}` : "Save to lead"}</>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Files are kept on the lead, visible to anyone who can see it. <Link href="/targets?tab=leads" className="text-primary">Back to leads</Link>
          </p>
        </>
      )}
    </div>
  );
}
