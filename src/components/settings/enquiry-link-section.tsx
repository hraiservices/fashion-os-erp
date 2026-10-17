"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ENQUIRY_SOURCES, enquiryUrl } from "@/lib/enquiry";

function QrCard({ source, url }: { source: string; url: string }) {
  const [png, setPng] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 2, width: 640 }).then((d) => alive && setPng(d), () => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="space-y-2 rounded-xl border p-3 text-center">
      <p className="text-sm font-medium">{source}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      {png ? <img src={png} alt={`QR code for the ${source} enquiry form`} className="mx-auto size-40 rounded-lg border bg-white" /> : <div className="mx-auto size-40 animate-pulse rounded-lg bg-muted" />}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"))}>
          <Copy className="size-4" /> Link
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1" nativeButton={false} render={<a href={png || undefined} download={`enquiry-${source.toLowerCase().replace(/\s+/g, "-")}.png`} />} disabled={!png}>
          <Download className="size-4" /> QR
        </Button>
      </div>
    </div>
  );
}

/** The public enquiry link and a QR code for each place you might share it, so you can see where leads come from. */
export function EnquiryLinkSection() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enquiry link &amp; QR codes</CardTitle>
        <CardDescription>Print a QR for the counter, or put the link in your Instagram bio or WhatsApp status. Each enquiry becomes a lead with that place as its source, and you get a notification.</CardDescription>
      </CardHeader>
      <CardContent>
        {origin && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ENQUIRY_SOURCES.map((s) => (
              <QrCard key={s} source={s} url={enquiryUrl(origin, s)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
