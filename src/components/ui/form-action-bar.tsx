export function FormActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 inset-x-0 z-20 flex items-center justify-end gap-2 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 print:hidden">
      {children}
    </div>
  );
}
