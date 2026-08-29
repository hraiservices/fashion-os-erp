"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Camera, Upload, Mic, Video, Square, Trash2, Loader2, Captions } from "lucide-react";
import {
  blobToDataUrl,
  compressImage,
  approxBytesOfDataUrl,
  formatBytes,
  formatDuration,
  pickRecorderMime,
  AUDIO_MIME_CANDIDATES,
  VIDEO_MIME_CANDIDATES,
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
} from "@/lib/media";
import { CameraModal } from "@/components/orders/camera-modal";
import { Button } from "@/components/ui/button";

type Kind = "audio" | "video";

/**
 * Attachment capture for an order: photos (camera or upload), voice notes, and short
 * videos. Stored as base64 data URLs on the order row — see lib/media.ts for why the
 * size caps exist.
 */
export function MediaCapture({
  images,
  audios,
  videos,
  onImagesChange,
  onAudiosChange,
  onVideosChange,
  onTranscribe,
  transcribingIndex,
}: {
  images: string[];
  audios: string[];
  videos: string[];
  onImagesChange: (v: string[]) => void;
  onAudiosChange: (v: string[]) => void;
  onVideosChange: (v: string[]) => void;
  /** Optional — when provided, each voice note gets a "Transcribe" button that calls back with
   *  its data URL and index. The caller owns the actual Gemini call and where the text goes. */
  onTranscribe?: (audioDataUrl: string, index: number) => void;
  /** Index of the voice note currently being transcribed, to show a spinner on just that one. */
  transcribingIndex?: number | null;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<Kind | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  /** Release camera/mic and timers no matter how the component goes away. */
  function teardown() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(null);
    setElapsed(0);
  }

  useEffect(() => teardown, []);

  function addWithLimit(dataUrl: string, limit: number, current: string[], setter: (v: string[]) => void, label: string) {
    const size = approxBytesOfDataUrl(dataUrl);
    if (size > limit) {
      toast.error(`That ${label} is ${formatBytes(size)} — too large to attach (limit ${formatBytes(limit)}).`);
      return;
    }
    setter([...current, dataUrl]);
  }

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const toAdd: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} isn't an image.`);
          continue;
        }
        const dataUrl = await compressImage(file);
        const size = approxBytesOfDataUrl(dataUrl);
        if (size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name} is ${formatBytes(size)} — too large (limit ${formatBytes(MAX_IMAGE_BYTES)}).`);
          continue;
        }
        toAdd.push(dataUrl);
      }
      if (toAdd.length) onImagesChange([...images, ...toAdd]);
    } catch {
      toast.error("Could not read that image.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording(kind: Kind) {
    if (recording) return;
    try {
      const constraints: MediaStreamConstraints = kind === "audio" ? { audio: true } : { audio: true, video: { facingMode: "environment" } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const mimeType = pickRecorderMime(kind === "audio" ? AUDIO_MIME_CANDIDATES : VIDEO_MIME_CANDIDATES);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        try {
          const dataUrl = await blobToDataUrl(blob);
          if (kind === "audio") addWithLimit(dataUrl, MAX_AUDIO_BYTES, audios, onAudiosChange, "recording");
          else addWithLimit(dataUrl, MAX_VIDEO_BYTES, videos, onVideosChange, "video");
        } catch {
          toast.error("Could not save the recording.");
        }
        teardown();
      };

      recorder.start();
      setRecording(kind);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

      if (kind === "video" && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        await videoPreviewRef.current.play().catch(() => {});
      }
    } catch {
      toast.error(kind === "audio" ? "Could not access the microphone." : "Could not access the camera.");
      teardown();
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else teardown();
  }

  const totalCount = images.length + audios.length + videos.length;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Paperclip className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Attachments</h2>
          <p className="text-xs text-muted-foreground">
            {totalCount === 0 ? "Reference photos, voice notes or a short video" : `${totalCount} attached`}
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {recording ? (
          <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-2">
              <span className="size-2.5 animate-pulse rounded-full bg-red-600" />
              <span className="text-sm font-medium">Recording {recording}</span>
              <span className="ml-auto tabular-nums text-sm">{formatDuration(elapsed)}</span>
            </div>
            {recording === "video" && <video ref={videoPreviewRef} playsInline muted className="max-h-56 w-full rounded-md bg-black object-contain" />}
            <Button type="button" variant="destructive" className="w-full" onClick={stopRecording}>
              <Square className="size-4" /> Stop &amp; attach
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => setCameraOpen(true)}>
              <Camera className="size-4" /> Photo
            </Button>
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => startRecording("audio")}>
              <Mic className="size-4" /> Voice
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => startRecording("video")}>
              <Video className="size-4" /> Video
            </Button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFilesPicked} />

        {images.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Photos ({images.length})</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((src, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Attachment ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => onImagesChange(images.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-90 transition-opacity hover:bg-black/80"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {audios.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Voice notes ({audios.length})</p>
            {audios.map((src, i) => (
              <div key={i} className="flex items-center gap-2">
                <audio controls src={src} className="h-9 min-w-0 flex-1" />
                {onTranscribe && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-9 shrink-0"
                    aria-label={`Transcribe voice note ${i + 1}`}
                    title="Transcribe into notes"
                    disabled={transcribingIndex != null}
                    onClick={() => onTranscribe(src, i)}
                  >
                    {transcribingIndex === i ? <Loader2 className="size-4 animate-spin" /> : <Captions className="size-4" />}
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon-sm" className="size-9 shrink-0" aria-label={`Remove voice note ${i + 1}`} onClick={() => onAudiosChange(audios.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {videos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Videos ({videos.length})</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {videos.map((src, i) => (
                <div key={i} className="relative">
                  <video controls src={src} className="w-full rounded-lg border bg-black" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1 size-8 bg-black/60 text-white hover:bg-black/80"
                    aria-label={`Remove video ${i + 1}`}
                    onClick={() => onVideosChange(videos.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CameraModal
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(dataUrl) => addWithLimit(dataUrl, MAX_IMAGE_BYTES, images, onImagesChange, "photo")}
      />
    </section>
  );
}
