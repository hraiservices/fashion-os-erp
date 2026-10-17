import { useMutation } from "@tanstack/react-query";
import { useAddLeadActivity, useUploadLeadAttachments } from "@/hooks/use-targets";
import { chunkChat, looksLikeChatExport, parseChatExport } from "@/lib/whatsapp-export";

export interface AttachSummary {
  uploaded: number;
  failures: string[];
  /** How many history entries the chat was saved as (a long chat is split). */
  chatEntries: number;
  /** Zip contents left out (unsupported type or over 25 MB). */
  skipped: string[];
}

/**
 * Puts everything from WhatsApp onto a lead in one go: loose photos/voice notes/documents become
 * attachments, a chat export (.zip or .txt) is unpacked into its media plus the chat text, and shared
 * text is saved as a WhatsApp entry in the lead's history. Used by the Share-to-Fashion-Flow page and
 * the lead page's "Import chat export" button.
 */
export function useAttachToLead() {
  const upload = useUploadLeadAttachments();
  const addActivity = useAddLeadActivity();

  return useMutation({
    mutationFn: async ({ id, files, text }: { id: string; files: File[]; text?: string }): Promise<AttachSummary> => {
      const media: File[] = [];
      const chats: string[] = [];
      const skipped: string[] = [];
      for (const file of files) {
        if (looksLikeChatExport(file)) {
          const parsed = await parseChatExport(file);
          media.push(...parsed.media);
          skipped.push(...parsed.skipped);
          if (parsed.chat) chats.push(parsed.chat);
        } else {
          media.push(file);
        }
      }
      if (text?.trim()) chats.push(text.trim());

      let uploaded = 0;
      let failures: string[] = [];
      if (media.length) {
        const r = await upload.mutateAsync({ id, files: media });
        uploaded = r.done;
        failures = r.failures;
      }

      // History shows newest first, so save the pieces last-to-first and the chat reads top-down.
      const pieces = chats.flatMap((c) => chunkChat(c));
      for (const body of [...pieces].reverse()) {
        await addActivity.mutateAsync({ id, kind: "whatsapp", body });
      }
      return { uploaded, failures, chatEntries: pieces.length, skipped };
    },
  });
}

/** One plain sentence about what an import did, for the toast. */
export function describeSummary(s: AttachSummary): string {
  const parts: string[] = [];
  if (s.uploaded) parts.push(`${s.uploaded} file${s.uploaded === 1 ? "" : "s"} added`);
  if (s.chatEntries) parts.push(s.chatEntries === 1 ? "chat saved to history" : `chat saved to history (${s.chatEntries} parts)`);
  if (s.skipped.length) parts.push(`${s.skipped.length} left out (unsupported or over 25 MB)`);
  return parts.length ? parts.join(", ") : "Nothing to add";
}
