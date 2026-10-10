"use client";

import Link from "next/link";
import { Plus, ClipboardList, Receipt, FileText, Repeat, CreditCard, UserPlus, Truck, ShoppingCart, FileSpreadsheet, Package, Boxes, Users, Wallet, Hammer, Calculator, Target, ListTodo } from "lucide-react";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isModuleEnabled, DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface QuickCreateItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
}

interface QuickCreateGroup {
  label: string;
  items: QuickCreateItem[];
}

/**
 * Global "+ New" flyout, Zoho-style — every create page in the app, grouped and reachable from
 * any screen's topbar, instead of only from the list page it belongs to. Desktop/laptop only
 * (lg+); mobile already has its own "+" FAB + bottom sheet in the tab bar (MobileTabBar) covering
 * the five most common create actions, which stays as-is.
 *
 * Each item is gated by the exact same permission the destination page (or its list page's own
 * "Add" button) already checks — this menu doesn't grant access, it's just a faster way to reach
 * something you could already navigate to.
 */
export function QuickCreateMenu() {
  const { data: user } = useCurrentUser();
  const { data: entitlements } = useModuleEntitlements();
  const targetsOn = isModuleEnabled(entitlements ?? DEFAULT_ENTITLEMENTS, "targets");
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const groups: QuickCreateGroup[] = [
    {
      label: "Orders & Sales",
      items: [
        { href: "/orders/new", label: "Order", icon: ClipboardList, show: !!user?.perms.addOrder },
        { href: "/sales/invoices/new", label: "Invoice", icon: Receipt, show: !!user?.perms.manageSales },
        { href: "/sales/quotations/new", label: "Quotation", icon: FileText, show: !!user?.perms.manageSales },
        { href: "/sales/recurring-invoices/new", label: "Recurring Invoice", icon: Repeat, show: !!user?.perms.manageSales },
        { href: "/payments/new", label: "Payment", icon: CreditCard, show: !!user?.perms.managePayments },
        { href: "/crm/new", label: "Customer", icon: UserPlus, show: !!(user?.perms.manageCustomers || isAdminOrManager) },
      ],
    },
    {
      label: "Purchases",
      items: [
        { href: "/purchases/vendors/new", label: "Vendor", icon: Truck, show: !!user?.perms.managePurchases },
        { href: "/purchases/orders/new", label: "Purchase Order", icon: ShoppingCart, show: !!user?.perms.managePurchases },
        { href: "/purchases/bills/new", label: "Bill", icon: FileSpreadsheet, show: !!user?.perms.managePurchases },
      ],
    },
    {
      label: "Inventory",
      items: [
        { href: "/inventory/products/new", label: "Product", icon: Package, show: !!user?.perms.manageInventory },
        { href: "/inventory/raw-materials/new", label: "Raw Material", icon: Boxes, show: !!user?.perms.manageInventory },
      ],
    },
    {
      label: "Other",
      items: [
        { href: "/expenses/new", label: "Expense", icon: Wallet, show: !!user?.perms.manageExpenses },
        { href: "/employees/new", label: "Employee", icon: Users, show: !!user?.perms.manageEmployees },
        { href: "/manufacturing/new", label: "Manufacturing Job", icon: Hammer, show: !!user?.perms.manageManufacturing },
        { href: "/cost-estimator/new", label: "Cost Estimate", icon: Calculator, show: true },
        { href: "/targets/leads/new", label: "Lead", icon: Target, show: targetsOn && !!user?.perms.manageLeads },
        { href: "/targets/tasks/new", label: "Task", icon: ListTodo, show: targetsOn && !!user?.perms.accessTargets },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="default" size="sm" className="hidden h-8 gap-1.5 lg:flex">
            <Plus className="size-4" /> New
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-[560px] max-w-[90vw] p-3">
        <div className="grid grid-cols-4 gap-x-4">
          {groups.map((group) => (
            // DropdownMenuLabel (Base UI's Menu.GroupLabel) throws at render time — "Base UI:
            // MenuGroupContext is missing" — unless it's inside a DropdownMenuGroup (Menu.Group)
            // ancestor; a plain wrapping <div> doesn't supply that context. That's exactly what
            // crashed this menu the instant it opened (every "+ New" group has its own label).
            <DropdownMenuGroup key={group.label} className="space-y-0.5">
              <DropdownMenuLabel className="px-1.5 uppercase tracking-wide">{group.label}</DropdownMenuLabel>
              {group.items.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} render={<Link href={href} />}>
                  <Icon className="size-4 text-muted-foreground" /> {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
