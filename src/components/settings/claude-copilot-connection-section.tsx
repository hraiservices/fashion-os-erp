"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useClaudeCopilotStatus, useSaveClaudeCopilotApiKey, useTestClaudeCopilotApiKey } from "@/hooks/use-claude-copilot-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The AI Copilot's Q&A chat now runs on Claude (Anthropic), not Gemini — switched after the
 * SQL-generation-then-Gemini design proved unreliable, per direct feedback that it "failed
 * totally." Without a key configured (env var OR here), every question fails identically with a
 * generic error; this gives an admin a self-service way to add/fix the key and confirm it works.
 */
export function ClaudeCopilotConnectionSection() {
  const { data: status, isLoading } = useClaudeCopilotStatus();
  const saveKey = useSaveClaudeCopilotApiKey();
  const testKey = useTestClaudeCopilotApiKey();
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
      toast.success("Claude API key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">AI Copilot connection (Claude)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          The AI Copilot chat — the question-answering assistant, not the daily briefing or voice/photo features below — runs on a Claude (Anthropic) API
          key. Get one at <span className="font-medium">console.anthropic.com</span> and paste it below. Costs a small amount per question (a fraction of a
          cent), unlike the free Gemini key below.
        </p>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Status:</span>
          {status?.configured ? (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="size-3" /> Configured{status.usingEnvVar ? " (server environment variable)" : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-destructive">
              <KeyRound className="size-3" /> Not configured — AI Copilot chat will fail
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="claude-api-key" className="text-xs font-medium">
            Claude API key
          </Label>
          <Input
            id="claude-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.configured ? "•••••••••••••••• (enter a new key to replace it)" : "Paste your Claude API key"}
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
