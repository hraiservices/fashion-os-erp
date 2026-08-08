"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, UserCog } from "lucide-react";
import { useEmployee } from "@/hooks/use-employees";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: employee, isLoading } = useEmployee(id);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href={`/employees/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to employee
      </Link>
      <h1 className="text-xl font-semibold">Edit employee</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !employee ? <EmptyState icon={UserCog} title="Employee not found" /> : <EmployeeForm existing={employee} />}
    </div>
  );
}
