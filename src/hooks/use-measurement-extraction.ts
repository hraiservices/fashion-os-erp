"use client";

import { useMutation } from "@tanstack/react-query";

/** Sends a photo of a paper measurement chart to Gemini and gets back whatever field values it
 *  could read — the order form merges these into the measurement grid, still fully editable
 *  before save. See src/lib/chatbot/gemini.ts's extractMeasurementsFromImage for the prompt. */
export function useExtractMeasurements() {
  return useMutation({
    mutationFn: async ({ imageDataUrl, fields }: { imageDataUrl: string; fields: string[] }) => {
      const res = await fetch("/api/measurements/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read the chart");
      return data.values as Record<string, string>;
    },
  });
}
