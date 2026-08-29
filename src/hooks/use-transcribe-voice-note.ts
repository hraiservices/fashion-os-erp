"use client";

import { useMutation } from "@tanstack/react-query";

/** Sends a voice note (data URL) to Gemini and gets back a text transcription — see
 *  src/lib/chatbot/gemini.ts's transcribeVoiceNote for the prompt. */
export function useTranscribeVoiceNote() {
  return useMutation({
    mutationFn: async (audioDataUrl: string) => {
      const res = await fetch("/api/orders/transcribe-voice-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't transcribe that recording");
      return data.text as string;
    },
  });
}
