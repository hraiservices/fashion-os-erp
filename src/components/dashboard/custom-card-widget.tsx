"use client";

import { Sparkles } from "lucide-react";
import { useCustomCardValue } from "@/hooks/use-custom-card-value";
import { DATA_SOURCES, type CustomCardConfig } from "@/lib/custom-card";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

export function CustomCardWidget({ config }: { config: CustomCardConfig }) {
  const { value, isLoading } = useCustomCardValue(config);
  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const display = config.format === "currency" ? inr(Math.round(value * 100) / 100) : Math.round(value * 100) / 100;
  const source = DATA_SOURCES[config.dataSource];

  return <StatCard label={config.title || "Custom card"} value={display} icon={Sparkles} href={source.linkTo} />;
}
