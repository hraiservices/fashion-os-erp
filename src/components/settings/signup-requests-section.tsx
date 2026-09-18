"use client";

import { toast } from "sonner";
import { Mail, Phone, Store, Copy } from "lucide-react";
import { useSignupRequests, useSetSignupRequestStatus, type SignupRequestRow } from "@/hooks/use-signup-requests";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = ["new", "contacted", "provisioned", "declined"] as const;

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  contacted: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  provisioned: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  declined: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

function RequestCard({ row }: { row: SignupRequestRow }) {
  const setStatus = useSetSignupRequestStatus();

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 font-semibold">
              <Store className="size-4 text-muted-foreground" />
              {row.shop_name}
            </div>
            <div className="text-sm text-muted-foreground">{row.name}</div>
          </div>
          <Badge className={STATUS_STYLES[row.status] || STATUS_STYLES.new}>{row.status}</Badge>
        </div>

        <div className="space-y-1 text-sm">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(row.email);
              toast.success("Email copied");
            }}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Mail className="size-3.5" />
            {row.email}
            <Copy className="size-3" />
          </button>
          {row.phone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="size-3.5" />
              {row.phone}
            </div>
          )}
        </div>

        {row.note && <p className="rounded-lg bg-muted/50 p-2 text-sm text-muted-foreground">{row.note}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</span>
          <Select
            value={row.status}
            onValueChange={(status) => {
              if (!status) return;
              setStatus.mutate({ id: row.id, status }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update") });
            }}
          >
            <SelectTrigger className="h-8 w-36 rounded-lg text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export function SignupRequestsSection() {
  const { data: requests, isLoading } = useSignupRequests();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No signup requests yet.</p>;
  }

  return (
    <div className="space-y-3">
      {requests.map((row) => (
        <RequestCard key={row.id} row={row} />
      ))}
    </div>
  );
}
