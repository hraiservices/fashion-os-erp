"use client";

import { use } from "react";
import { UserCog } from "lucide-react";
import { useEmployee } from "@/hooks/use-employees";
import { EmployeeForm } from "@/components/employees/employee-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: employee, isLoading } = useEmployee(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!employee) return <EmptyState icon={UserCog} title="Employee not found" />;
  return <EmployeeForm existing={employee} />;
}
