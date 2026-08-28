"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Star } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { fileToDataUrl } from "@/lib/image-utils";
import {
  blankInvoiceTemplate,
  hydrateInvoiceTemplate,
  DEFAULT_INVOICE_TEMPLATES_SETTING,
  type InvoiceTemplateConfig,
  type InvoiceTemplatesSetting,
} from "@/lib/invoice-template";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ImageUploadRow({
  label,
  showToggle,
  onShowToggle,
  dataUrl,
  onUpload,
  onClear,
}: {
  label: string;
  showToggle: boolean;
  onShowToggle: (v: boolean) => void;
  dataUrl: string | null;
  onUpload: (dataUrl: string) => void;
  onClear: () => void;
}) {
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      onUpload(await fileToDataUrl(file));
    } catch {
      toast.error("Could not read image");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <CheckboxRow label={label} checked={showToggle} onChange={onShowToggle} />
      <div className="flex items-center gap-3">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={label} className="h-14 w-14 rounded border object-contain bg-white" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded border text-[10px] text-muted-foreground">None</div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<label className="cursor-pointer" />}>
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </Button>
          {dataUrl && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Settings > Invoice Template — color/paper/font/field-visibility config + logo/QR/signature images, stored in app_settings.invoiceTemplates and read by lib/pdf/invoice-document.tsx at PDF-render time. */
export function InvoiceTemplateSection() {
  const { data, isLoading, save } = useAppSetting<InvoiceTemplatesSetting>("invoiceTemplates", DEFAULT_INVOICE_TEMPLATES_SETTING);
  const [setting, setSetting] = useState<InvoiceTemplatesSetting>(DEFAULT_INVOICE_TEMPLATES_SETTING);
  const [activeId, setActiveId] = useState<string>(DEFAULT_INVOICE_TEMPLATES_SETTING.defaultId);

  useSyncFromSource(data, (d) => {
    if (d) {
      setSetting({ ...d, templates: d.templates.map(hydrateInvoiceTemplate) });
      if (!d.templates.some((t) => t.id === activeId)) setActiveId(d.defaultId);
    }
  });

  const active = setting.templates.find((t) => t.id === activeId) || setting.templates[0];

  function updateActive(patch: Partial<InvoiceTemplateConfig>) {
    setSetting((s) => ({ ...s, templates: s.templates.map((t) => (t.id === active.id ? { ...t, ...patch } : t)) }));
  }

  function addTemplate() {
    const tpl = blankInvoiceTemplate(`Template ${setting.templates.length + 1}`);
    setSetting((s) => ({ ...s, templates: [...s.templates, tpl] }));
    setActiveId(tpl.id);
  }

  function removeTemplate(id: string) {
    if (setting.templates.length <= 1) {
      toast.error("Keep at least 1 template");
      return;
    }
    setSetting((s) => {
      const templates = s.templates.filter((t) => t.id !== id);
      const defaultId = s.defaultId === id ? templates[0].id : s.defaultId;
      return { ...s, templates, defaultId };
    });
    if (activeId === id) setActiveId(setting.templates.find((t) => t.id !== id)?.id || setting.templates[0].id);
  }

  function setAsDefault(id: string) {
    setSetting((s) => ({ ...s, defaultId: id }));
  }

  async function onSave() {
    try {
      await save.mutateAsync(setting);
      toast.success("Invoice template settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading || !active) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Invoice PDF template</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {setting.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs ${t.id === activeId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
            >
              {t.name}
              {t.id === setting.defaultId && <Star className="size-3 fill-current text-amber-500" />}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={addTemplate}>
            <Plus className="size-3.5" /> New template
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Template name</label>
            <Input value={active.name} onChange={(e) => updateActive({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Accent color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={active.colorTheme} onChange={(e) => updateActive({ colorTheme: e.target.value })} className="h-11 w-14 rounded border sm:h-9 sm:w-12" />
              <Input value={active.colorTheme} onChange={(e) => updateActive({ colorTheme: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Paper size</label>
            <Select value={active.paperSize} onValueChange={(v) => v && updateActive({ paperSize: v as InvoiceTemplateConfig["paperSize"] })}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="Letter">Letter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Orientation</label>
            <Select value={active.orientation} onValueChange={(v) => v && updateActive({ orientation: v as InvoiceTemplateConfig["orientation"] })}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Font</label>
            <Select value={active.font} onValueChange={(v) => v && updateActive({ font: v as InvoiceTemplateConfig["font"] })}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Helvetica">Helvetica</SelectItem>
                <SelectItem value="Times-Roman">Times Roman</SelectItem>
                <SelectItem value="Courier">Courier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Margin (pt)</label>
            <NumberInput
              min={0}
              value={active.margin}
              onChange={(v) => updateActive({ margin: v || 0 })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Typography &amp; sizing</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Logo size (px)</label>
              <NumberInput min={16} max={200} value={active.logoWidth} onChange={(v) => updateActive({ logoWidth: v || 64 })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Shop name size</label>
              <NumberInput min={8} max={40} value={active.shopNameFontSize} onChange={(v) => updateActive({ shopNameFontSize: v || 16 })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">&quot;INVOICE&quot; title size</label>
              <NumberInput min={8} max={40} value={active.invoiceTitleFontSize} onChange={(v) => updateActive({ invoiceTitleFontSize: v || 18 })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Customer name size</label>
              <NumberInput min={6} max={30} value={active.customerNameFontSize} onChange={(v) => updateActive({ customerNameFontSize: v || 11 })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Invoice number size</label>
              <NumberInput min={6} max={30} value={active.invoiceNumberFontSize} onChange={(v) => updateActive({ invoiceNumberFontSize: v || 10 })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            <CheckboxRow label="Bold shop name" checked={active.boldShopName} onChange={(v) => updateActive({ boldShopName: v })} />
            <CheckboxRow label="Bold customer name" checked={active.boldCustomerName} onChange={(v) => updateActive({ boldCustomerName: v })} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Fields shown on the PDF</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <CheckboxRow label="Line subtotal" checked={active.showSubtotal} onChange={(v) => updateActive({ showSubtotal: v })} />
            <CheckboxRow label="Discount" checked={active.showDiscount} onChange={(v) => updateActive({ showDiscount: v })} />
            <CheckboxRow label="Shipping" checked={active.showShipping} onChange={(v) => updateActive({ showShipping: v })} />
            <CheckboxRow label="Tax breakup (GST)" checked={active.showTax} onChange={(v) => updateActive({ showTax: v })} />
            <CheckboxRow label="Amount in words" checked={active.showAmountInWords} onChange={(v) => updateActive({ showAmountInWords: v })} />
            <CheckboxRow label="Page numbers" checked={active.showPageNumbers} onChange={(v) => updateActive({ showPageNumbers: v })} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <ImageUploadRow
            label="Show logo"
            showToggle={active.showLogo}
            onShowToggle={(v) => updateActive({ showLogo: v })}
            dataUrl={active.logoDataUrl}
            onUpload={(dataUrl) => updateActive({ logoDataUrl: dataUrl, showLogo: true })}
            onClear={() => updateActive({ logoDataUrl: null })}
          />
          <ImageUploadRow
            label="Show payment QR code"
            showToggle={active.showQrCode}
            onShowToggle={(v) => updateActive({ showQrCode: v })}
            dataUrl={active.qrCodeDataUrl}
            onUpload={(dataUrl) => updateActive({ qrCodeDataUrl: dataUrl, showQrCode: true })}
            onClear={() => updateActive({ qrCodeDataUrl: null })}
          />
          <ImageUploadRow
            label="Show signature"
            showToggle={active.showSignature}
            onShowToggle={(v) => updateActive({ showSignature: v })}
            dataUrl={active.signatureDataUrl}
            onUpload={(dataUrl) => updateActive({ signatureDataUrl: dataUrl, showSignature: true })}
            onClear={() => updateActive({ signatureDataUrl: null })}
          />
        </div>

        <div className="space-y-1.5">
          <CheckboxRow label="Show bank details block" checked={active.showBankDetails} onChange={(v) => updateActive({ showBankDetails: v })} />
          <Textarea
            rows={3}
            placeholder="Bank name, account number, IFSC, branch…"
            value={active.bankDetails}
            onChange={(e) => updateActive({ bankDetails: e.target.value })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div className="flex items-center gap-2">
            {active.id !== setting.defaultId && (
              <Button variant="outline" size="sm" onClick={() => setAsDefault(active.id)}>
                <Star className="size-3.5" /> Set as default
              </Button>
            )}
            {active.id === setting.defaultId && <Badge variant="secondary">Default template</Badge>}
            {setting.templates.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeTemplate(active.id)}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            )}
          </div>
          <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
