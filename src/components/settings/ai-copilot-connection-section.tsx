"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useAiCopilotStatus, useSaveAiCopilotApiKey, useTestAiCopilotApiKey } from "@/hooks/use-ai-copilot-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Without a Gemini API key configured (env var OR here), every single AI Copilot question fails
 * identically with a generic "couldn't find an answer" — indistinguishable from the AI just not
 * understanding the question. This gives an admin a self-service way to add/fix the key and
 * confirm it actually works, rather than needing a developer to check a hosting dashboard.
 */
export function AiCopilotConnectionSection() {
  const { data: status, isLoading } = useAiCopilotStatus();
  const saveKey = useSaveAiCopilotApiKey();
  const testKey = useTestAiCopilotApiKey();
  const [apiKey, setApiKey] = useState("");

  async function handleTest() {
    if (!apiKey.trim()) {
      toast.error("Enter an API key first");
      return;
    }
    try {
      await testKey.mutateAsync(apiKey.trim());
      toast.success("Key works — AI Copilot responded successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The key didn't work");
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Enter an API key first");
      return;
    }
    try {
      await saveKey.mutateAsync(apiKey.trim());
      setApiKey("");
      toast.success("Gemini API key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">AI connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          AI Copilot, the daily briefing, voice-note transcription, and measurement-photo reading all run on a Google Gemini API key. Get a free key at{" "}
          <span className="font-medium">aistudio.google.com/apikey</span> and paste it below.
        </p>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Status:</span>
          {status?.configured ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="size-3" /> Configured{status.usingEnvVar ? " (server environment variable)" : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-destructive">
              <KeyRound className="size-3" /> Not configured — AI features will fail
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gemini-api-key" className="text-xs font-medium">
            Gemini API key
          </Label>
          <Input
            id="gemini-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.configured ? "•••••••••••••••• (enter a new key to replace it)" : "Paste your Gemini API key"}
            autoComplete="off"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testKey.isPending || !apiKey.trim()}>
            {testKey.isPending ? "Testing…" : "Test"}
          </Button>
          <Button onClick={handleSave} disabled={saveKey.isPending || !apiKey.trim()}>
            {saveKey.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
