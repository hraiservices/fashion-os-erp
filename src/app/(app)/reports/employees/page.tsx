"use client";

import { useMemo, useState } from "react";
import { Printer, UserCog } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { printReport } from "@/lib/export";
import { fmtDate, inr } from "@/lib/format";
import { SALARY_TYPE_LABELS } from "@/lib/payroll";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** A pure roster, not a transaction log — the date range filters by joinedDate, so it reads as
 *  "who joined in this window" rather than "activity in this window" like other reports. */
export default function EmployeeDirectoryReportPage() {
  const { data: employees, isLoading } = useEmployees();
  const { data: user } = useCurrentUser();
  const [showInactive, setShowInactive] = useState(false);
  const canSeeSalary = !!user?.perms.managePayroll;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    return (employees || [])
      .filter((e) => showInactive || e.active)
      .filter((e) => isWithinDateRange(e.joinedDate, range))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, showInactive, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Employee Directory"
      description="Full roster — role, contact, employment details"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide inactive" : "Show inactive"}
          </Button>
          {rows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                printReport(
                  "Employee Directory",
                  `<table><thead><tr><th>Name</th><th>Role</th><th>Mobile</th><th>Employment</th><th>Joined</th><th>Status</th></tr></thead><tbody>${rows
                    .map((e) => `<tr><td>${e.name}</td><td>${e.role || "—"}</td><td>${e.mobile || "—"}</td><td>${e.employmentType}</td><td>${e.joinedDate ? fmtDate(e.joinedDate) : "—"}</td><td>${e.active ? "Active" : "Inactive"}</td></tr>`)
                    .join("")}</tbody></table>`
                )
              }
            >
              <Printer className="size-4" /> Print
            </Button>
          )}
        </>
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {rows.length === 0 ? (
        <EmptyState icon={UserCog} title="No employees yet" description="Add employees in Employees to see them here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Mobile</Th>
              <Th>Employment</Th>
              <Th>Joined</Th>
              {canSeeSalary && <Th align="right">Salary</Th>}
              <Th align="right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <Td>{e.name}</Td>
                <Td>{e.role || "—"}</Td>
                <Td>{e.mobile || "—"}</Td>
                <Td className="capitalize">{e.employmentType.replace("_", " ")}</Td>
                <Td>{e.joinedDate ? fmtDate(e.joinedDate) : "—"}</Td>
                {canSeeSalary && (
                  <Td align="right">
                    {inr(e.salaryRate)} <span className="text-xs text-muted-foreground">/{SALARY_TYPE_LABELS[e.salaryType].toLowerCase()}</span>
                  </Td>
                )}
                <Td align="right">
                  <Badge variant={e.active ? "secondary" : "outline"}>{e.active ? "Active" : "Inactive"}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
