"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Eye, EyeOff, ChevronDown, RotateCcw } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import {
  DEFAULT_NAV_LAYOUT,
  MOVABLE_GROUPS,
  mergeRootOrder,
  resolveGroupChildren,
  getRootMeta,
  findLeafAnywhere,
  type NavLayoutSetting,
} from "@/lib/nav-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function draftFrom(saved: NavLayoutSetting | undefined | null): NavLayoutSetting {
  return {
    rootOrder: mergeRootOrder(saved?.rootOrder),
    hiddenRoot: saved?.hiddenRoot ? [...saved.hiddenRoot] : [],
    groupChildren: resolveGroupChildren(saved?.groupChildren),
    hiddenLeaves: saved?.hiddenLeaves ? [...saved.hiddenLeaves] : [],
  };
}

function moveInArray<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Row shared by both the root-order list and each group's leaf list — reorder + hide, nothing else differs. */
function EditorRow({
  icon: Icon,
  label,
  hidden,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  disableUp,
  disableDown,
  extra,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  hidden: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleHidden: () => void;
  disableUp: boolean;
  disableDown: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm", hidden && "opacity-50")}>
      <div className="flex shrink-0 flex-col">
        <button type="button" onClick={onMoveUp} disabled={disableUp} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Move ${label} up`}>
          <ArrowUp className="size-3" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={disableDown} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Move ${label} down`}>
          <ArrowDown className="size-3" />
        </button>
      </div>
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {extra}
      <button
        type="button"
        onClick={onToggleHidden}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        title={hidden ? "Hidden — click to show" : "Visible — click to hide"}
      >
        {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Lets an admin hide, reorder, and re-group every sidebar entry — saved shop-wide so it applies to everyone. */
export function NavigationSection() {
  const { data, isLoading, save } = useAppSetting<NavLayoutSetting>("navLayout", DEFAULT_NAV_LAYOUT);
  const [draft, setDraft] = useState<NavLayoutSetting | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(MOVABLE_GROUPS[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);

  useSyncFromSource(isLoading, (loading) => {
    if (!loading && !draft) setDraft(draftFrom(data));
  });

  if (isLoading || !draft) return <Skeleton className="h-96 w-full" />;

  function update(patch: Partial<NavLayoutSetting>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }

  function moveRoot(id: string, dir: -1 | 1) {
    const idx = draft!.rootOrder.indexOf(id);
    update({ rootOrder: moveInArray(draft!.rootOrder, idx, dir) });
  }

  function toggleRootHidden(id: string) {
    const hiddenRoot = draft!.hiddenRoot.includes(id) ? draft!.hiddenRoot.filter((x) => x !== id) : [...draft!.hiddenRoot, id];
    update({ hiddenRoot });
  }

  function moveLeaf(groupId: string, href: string, dir: -1 | 1) {
    const list = draft!.groupChildren[groupId];
    const idx = list.indexOf(href);
    update({ groupChildren: { ...draft!.groupChildren, [groupId]: moveInArray(list, idx, dir) } });
  }

  function toggleLeafHidden(href: string) {
    const hiddenLeaves = draft!.hiddenLeaves.includes(href) ? draft!.hiddenLeaves.filter((x) => x !== href) : [...draft!.hiddenLeaves, href];
    update({ hiddenLeaves });
  }

  function moveLeafToGroup(fromGroupId: string, href: string, toGroupId: string) {
    if (fromGroupId === toGroupId) return;
    const groupChildren = { ...draft!.groupChildren };
    groupChildren[fromGroupId] = groupChildren[fromGroupId].filter((h) => h !== href);
    groupChildren[toGroupId] = [...groupChildren[toGroupId], href];
    update({ groupChildren });
  }

  async function onSave() {
    try {
      await save.mutateAsync(draft!);
      setDirty(false);
      toast.success("Sidebar layout saved for everyone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save layout");
    }
  }

  function onReset() {
    setDraft(draftFrom(null));
    setDirty(true);
    toast.success("Reset to default — click Save to apply");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Sidebar sections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">Reorder or hide entire pages and groups. This is the top-to-bottom order everyone sees in the sidebar.</p>
          <div className="space-y-1.5">
            {draft.rootOrder.map((id, i) => {
              const meta = getRootMeta(id);
              if (!meta) return null;
              return (
                <EditorRow
                  key={id}
                  icon={meta.icon}
                  label={meta.label}
                  hidden={draft.hiddenRoot.includes(id)}
                  onMoveUp={() => moveRoot(id, -1)}
                  onMoveDown={() => moveRoot(id, 1)}
                  onToggleHidden={() => toggleRootHidden(id)}
                  disableUp={i === 0}
                  disableDown={i === draft.rootOrder.length - 1}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Menu items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Hide or reorder items inside each group, or move an item into a different group with &quot;Move to&quot;.
          </p>
          {MOVABLE_GROUPS.map((g) => {
            const isOpen = openGroup === g.id;
            const items = draft.groupChildren[g.id];
            return (
              <div key={g.id} className="overflow-hidden rounded-lg border">
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : g.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/50"
                >
                  <g.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{g.label}</span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                </button>
                {isOpen && (
                  <div className="space-y-1.5 p-3">
                    {items.map((href, i) => {
                      const leaf = findLeafAnywhere(href);
                      if (!leaf) return null;
                      return (
                        <EditorRow
                          key={href}
                          label={leaf.label}
                          hidden={draft.hiddenLeaves.includes(href)}
                          onMoveUp={() => moveLeaf(g.id, href, -1)}
                          onMoveDown={() => moveLeaf(g.id, href, 1)}
                          onToggleHidden={() => toggleLeafHidden(href)}
                          disableUp={i === 0}
                          disableDown={i === items.length - 1}
                          extra={
                            <Select value={g.id} onValueChange={(v) => v && moveLeafToGroup(g.id, href, v)}>
                              <SelectTrigger className="h-7 w-32 shrink-0 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MOVABLE_GROUPS.map((og) => (
                                  <SelectItem key={og.id} value={og.id}>
                                    {og.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onSave} disabled={save.isPending || !dirty}>
          {save.isPending ? "Saving…" : "Save & apply for everyone"}
        </Button>
        <Button variant="outline" className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onReset}>
          <RotateCcw className="size-4" /> Reset to default
        </Button>
      </div>
    </div>
  );
}
