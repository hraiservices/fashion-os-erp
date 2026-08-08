import { PageHeader } from "@/components/ui/page-header";

/** Consistent chrome for every /settings/* page. */
export function SettingsPage({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}
