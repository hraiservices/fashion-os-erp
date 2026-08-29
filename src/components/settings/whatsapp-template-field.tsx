"use client";

import { useWhatsAppTemplates } from "@/hooks/use-whatsapp-templates";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = { APPROVED: "✅", PENDING: "⏳", REJECTED: "❌" };

/**
 * A template-name field that upgrades itself into a dropdown of the shop's real approved Meta
 * templates once they're fetchable (wabaId + Access Token saved), falling back to a plain text
 * input otherwise — never a hard requirement, just removes the "type the exact name from
 * memory" failure mode when the list is available. Flags a template whose actual parameter
 * count doesn't match what this particular send needs.
 */
export function WhatsAppTemplateField({
  value,
  onChange,
  expectedParamCount,
  templatesEnabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** How many {{n}} body parameters THIS send fills in — used only to flag a mismatch. */
  expectedParamCount: number;
  /** Whether fetching the template list is worth attempting (wabaId + Access Token present). */
  templatesEnabled: boolean;
  placeholder?: string;
}) {
  const { data: templates, isLoading, isError } = useWhatsAppTemplates(templatesEnabled);
  const selected = templates?.find((t) => t.name === value);

  if (templates && templates.length > 0) {
    return (
      <div className="space-y-1">
        <Select value={value || undefined} onValueChange={(v) => v && onChange(v)}>
          <SelectTrigger>
            <SelectValue>{() => value || "Choose a template…"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={`${t.name}-${t.language}`} value={t.name}>
                {STATUS_LABELS[t.status] || ""} {t.name} · {t.language} · {t.paramCount} param{t.paramCount === 1 ? "" : "s"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && selected.paramCount !== expectedParamCount && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ This template has {selected.paramCount} parameter{selected.paramCount === 1 ? "" : "s"}, but this send fills in {expectedParamCount}.
          </p>
        )}
        {selected && selected.status !== "APPROVED" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ This template isn&apos;t approved yet ({selected.status.toLowerCase()}) — sends will fail until it is.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {templatesEnabled && isLoading && <p className="text-xs text-muted-foreground">Loading your approved templates…</p>}
      {templatesEnabled && isError && <p className="text-xs text-muted-foreground">Couldn&apos;t fetch templates from Meta — type the exact name.</p>}
      {!templatesEnabled && <p className="text-xs text-muted-foreground">Set the WhatsApp Business Account ID below to pick from your approved templates.</p>}
    </div>
  );
}
