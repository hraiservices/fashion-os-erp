import type { Employee, Order } from "@/lib/types";

/** orders.tailor stores an employee id (see add_tailor_piece_rate.sql — every tailor field in
 *  the app was upgraded from a free-text name match to a real id). */
export function ordersForEmployee(employee: Employee, orders: Order[]): Order[] {
  return orders.filter((o) => o.tailor === employee.id);
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
