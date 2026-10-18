"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Download, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAiOn, useTryOn } from "@/hooks/use-ai";

/** Shrinks a photo to at most 1024px on its longest side and returns a JPEG data URL — phone photos are huge and the AI doesn't need them. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function Picker({ label, hint, value, onPick }: { label: string; hint: string; value: string; onPick: (dataUrl: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            onPick(await shrink(f));
          } catch {
            toast.error("Couldn't read that photo");
          }
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/30 text-muted-foreground">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
          <img src={value} alt={label} className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-3 text-center text-xs">
            <ImagePlus className="size-6" />
            {hint}
          </span>
        )}
      </button>
    </div>
  );
}

/** EXPERIMENT: a rough "how it might look" preview from the customer's photo and a design photo. Staff-run, customer must agree, nothing is stored. */
export default function TryOnPage() {
  const on = useAiOn("tryon");
  const tryOn = useTryOn();
  const [person, setPerson] = useState("");
  const [design, setDesign] = useState("");
  const [consent, setConsent] = useState(false);
  const [notes, setNotes] = useState("");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <PageHeader title="Try-on Preview" description="Experimental: a rough picture of how a design might look on the customer. It is not a promise of the final garment." />
      {!on ? (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">This helper is switched off. An admin can turn on &quot;Virtual try-on preview&quot; in Settings → AI Helpers.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Picker label="Customer photo" hint="Full-length, front-facing, plain background" value={person} onPick={setPerson} />
            <Picker label="Design photo" hint="The outfit they like" value={design} onPick={setDesign} />
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} rows={2} placeholder="Optional notes, e.g. 'make the blouse sleeveless'" className="text-base" />
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-primary" />
            The customer has agreed to a preview being made from their photo. The photos are sent to the AI service and are not saved.
          </label>
          <Button
            type="button"
            className="h-12 w-full"
            disabled={!person || !design || !consent || tryOn.isPending}
            onClick={() => tryOn.mutate({ person, design, consent: true, notes: notes.trim() || undefined }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't make the preview") })}
          >
            {tryOn.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {tryOn.isPending ? "Making the preview… (about 20 seconds)" : "Make preview"}
          </Button>
          {tryOn.data && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              <img src={tryOn.data.image} alt="Try-on preview" className="mx-auto max-h-[70dvh] rounded-xl border" />
              <p className="text-center text-xs text-muted-foreground">Preview only — colours, fit and details may differ from the stitched garment.</p>
              <Button type="button" variant="outline" className="h-12 w-full" nativeButton={false} render={<a href={tryOn.data.image} download="try-on-preview.png" />}>
                <Download className="size-4" /> Save picture
              </Button>
            </div>
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Camera className="size-3.5" /> Tip: a clear, full-length photo in good light gives the best result.
          </p>
        </>
      )}
    </div>
  );
}
