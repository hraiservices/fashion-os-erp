import type { Employee, Order } from "@/lib/types";

/**
 * v1 commission attribution: matches an employee's `name` against the free-text
 * `orders.tailor` column (there's no FK — see add_employees_module.sql notes). This is a
 * known limitation, not a bug: linking orders.tailor to employees.id would require a
 * migration touching the heavily-used orders/work_orders tables, which the Employees module
 * deliberately avoids in v1.
 */
export function ordersForEmployee(employee: Employee, orders: Order[]): Order[] {
  const name = employee.name.trim().toLowerCase();
  if (!name) return [];
  return orders.filter((o) => o.tailor.trim().toLowerCase() === name);
}

export function computeCommission(employee: Employee, orders: Order[]): { attributedOrders: number; attributedValue: number; commission: number } {
  const attributed = ordersForEmployee(employee, orders);
  const attributedValue = attributed.reduce((s, o) => s + (o.total || 0), 0);
  let commission = 0;
  if (employee.commissionType === "percent_of_sales") {
    commission = (attributedValue * employee.commissionRate) / 100;
  } else if (employee.commissionType === "flat_per_order") {
    commission = attributed.length * employee.commissionRate;
  }
  return { attributedOrders: attributed.length, attributedValue, commission };
}
