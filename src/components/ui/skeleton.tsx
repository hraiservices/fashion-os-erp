import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

/**
 * Mimics the shape of a MobileRecordCard/order row — an icon circle, two text lines of
 * different widths, and a trailing value — instead of one flat bar. A loading state that
 * already looks like the content it's about to become reads as a native app's placeholder
 * shimmer; a plain rectangle reads as "this page is still just loading, generically".
 */
function SkeletonListItem({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border bg-card p-3", className)}>
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-4 w-14 shrink-0" />
    </div>
  )
}

export { Skeleton, SkeletonListItem }
