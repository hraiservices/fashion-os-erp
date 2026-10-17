import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { LEAD_MEDIA_BUCKET, LEAD_MEDIA_MAX_BYTES, leadMediaKind, safeObjectName } from "@/lib/lead-media";

/**
 * Inbound WhatsApp → leads. Off unless `leadCaptureEnabled` is set in the Cloud API config. A message from a number with
 * an open lead lands on that lead's timeline (photos / voice notes / PDFs become attachments); a brand-new number
 * becomes a "WhatsApp" lead. Numbers that already belong to a customer are left to the order concierge.
 *
 * Like the rest of the Cloud API code this can't be exercised without a real Meta account — treat as untested.
 */


export interface InboundWaMessage {
  id?: string;
  from: string;
  type: string;
  text?: { body?: string };
  caption?: string;
  media?: { id: string; mime_type?: string; filename?: string };
  profileName?: string;
}

/** Every message in the payload (Meta batches), with the sender's WhatsApp profile name when given. */
export function extractAllMessages(payload: unknown): InboundWaMessage[] {
  const out: InboundWaMessage[] = [];
  try {
    const entries = (payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contacts = (value.contacts || []) as { wa_id?: string; profile?: { name?: string } }[];
        const messages = (value.messages || []) as Record<string, unknown>[];
        for (const m of messages) {
          const from = String(m.from || "");
          if (!from) continue;
          const type = String(m.type || "");
          const body = m[type] as { id?: string; mime_type?: string; filename?: string; caption?: string; body?: string } | undefined;
          const isMedia = ["image", "audio", "video", "document", "voice"].includes(type) && body?.id;
          out.push({
            id: typeof m.id === "string" ? m.id : undefined,
            from,
            type,
            text: type === "text" ? { body: body?.body } : undefined,
            caption: body?.caption,
            media: isMedia ? { id: body!.id!, mime_type: body?.mime_type, filename: body?.filename } : undefined,
            profileName: contacts.find((c) => c.wa_id === from)?.profile?.name,
          });
        }
      }
    }
  } catch {
    /* malformed payload — nothing to capture */
  }
  return out;
}

function last10(waId: string): string {
  const d = waId.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

async function downloadMedia(config: WhatsAppCloudApiConfig, mediaId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: `Bearer ${config.accessToken}` } });
  if (!meta.ok) return null;
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url || (info.file_size ?? 0) > LEAD_MEDIA_MAX_BYTES) return null;
  const file = await fetch(info.url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
  if (!file.ok) return null;
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > LEAD_MEDIA_MAX_BYTES) return null;
  return { bytes, contentType: info.mime_type || file.headers.get("content-type") || "" };
}

/** Returns true when the message was handled as a lead message (so the concierge should stay quiet). */
export async function captureInboundForLead(serviceClient: SupabaseClient<Database>, config: WhatsAppCloudApiConfig, msg: InboundWaMessage): Promise<boolean> {
  const mobile = last10(msg.from);
  if (mobile.length < 10) return false;

  const { data: leads } = await serviceClient.from("leads").select("id, stage").eq("mobile", mobile).order("updated_at", { ascending: false }).limit(5);
  let leadId = (leads || []).find((l) => l.stage !== "won" && l.stage !== "lost")?.id;

  if (!leadId) {
    // An existing customer writing in is an order enquiry, not a new lead.
    const { data: customer } = await serviceClient.from("customers").select("id").eq("mobile", mobile).limit(1).maybeSingle();
    if (customer) return false;
    const { data: created, error } = await serviceClient
      .from("leads")
      .insert({ name: msg.profileName?.trim() || `WhatsApp ${mobile}`, mobile, source: "WhatsApp", created_by: "whatsapp" })
      .select("id")
      .single();
    if (error || !created) return false;
    leadId = created.id;
    await serviceClient.from("lead_activities").insert({ lead_id: leadId, kind: "note", body: "Lead created from an incoming WhatsApp message", created_by: "whatsapp" });
  }

  let body = msg.text?.body || msg.caption || "";
  if (msg.media) {
    try {
      const file = await downloadMedia(config, msg.media.id);
      const kind = file ? leadMediaKind(file.contentType) : null;
      if (file && kind) {
        const name = msg.media.filename || `whatsapp-${kind}`;
        const path = `${leadId}/${safeObjectName(name.includes(".") ? name : `${name}.${file.contentType.split("/")[1]?.split(";")[0] || "bin"}`)}`;
        const up = await serviceClient.storage.from(LEAD_MEDIA_BUCKET).upload(path, file.bytes, { contentType: file.contentType });
        if (!up.error) {
          await serviceClient.from("lead_attachments").insert({ lead_id: leadId, kind, name, path, content_type: file.contentType, size_bytes: file.bytes.byteLength, created_by: "whatsapp" });
          body = body ? `${body} (sent a ${kind})` : `Sent a ${kind}`;
        }
      }
    } catch (e) {
      console.error("WhatsApp lead media capture failed:", e);
    }
    if (!body) body = `Sent a ${msg.type}`;
  }
  if (!body) return true;

  await serviceClient.from("lead_activities").insert({ lead_id: leadId, kind: "whatsapp", body: `Customer: ${body}`.slice(0, 1000), created_by: "whatsapp" });
  await serviceClient.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
  return true;
}
