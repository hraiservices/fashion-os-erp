"use client";

import { useQuery } from "@tanstack/react-query";

export interface DeploymentStatus {
  hasServiceRoleKey: boolean;
  hasRazorpayWebhookSecret: boolean;
  hasAttendanceSessionSecret: boolean;
  selfSignupEnabled: boolean;
}

async function fetchDeploymentStatus(): Promise<DeploymentStatus> {
  const res = await fetch("/api/admin/deployment-status");
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to load deployment status");
  return res.json();
}

/** Env-var-presence flags for the Admin Console's deployment info card — platform-owner only,
 *  see src/app/api/admin/deployment-status/route.ts for what it actually checks (never values). */
export function useDeploymentStatus() {
  return useQuery({ queryKey: ["deployment-status"], queryFn: fetchDeploymentStatus, staleTime: 60_000 });
}
