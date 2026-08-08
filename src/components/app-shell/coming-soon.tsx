export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">This report/section isn&apos;t built yet in the rewrite — flagging it rather than faking it.</p>
    </div>
  );
}
