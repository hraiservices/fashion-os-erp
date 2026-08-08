"use client";

import Link from "next/link";
import { UserCog } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * The tailor list used to live here as a plain app_settings string array. It's now sourced
 * from the Employees module (role="tailor", active=true) so tailors have real records for
 * attendance and commission — this page just redirects staff who still have the old link.
 */
export function TailorsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Tailors moved to Employees</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tailors are now managed under Employees — add a staff member with role &quot;Tailor&quot; and they&apos;ll appear in the Tailor dropdown on orders and work orders, plus get
          attendance and commission tracking.
        </p>
        <Button nativeButton={false} render={<Link href="/employees" />}>
          <UserCog className="size-4" /> Go to Employees
        </Button>
      </CardContent>
    </Card>
  );
}
