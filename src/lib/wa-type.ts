import { dueBadge } from "@/lib/business-rules";
import type { WhatsAppMessageType } from "@/lib/business-rules";
import type { Order } from "@/lib/types";

/** waType computation, Stitching_Manager_Pro_v16.html ~line 9253. */
export function resolveWaType(order: Pick<Order, "status" | "deliveryDate">): WhatsAppMessageType {
  if (order.status === "ready") return "ready";
  const badge = dueBadge(order as Order);
  if (badge?.urgent) return "overdue";
  if (order.status === "payment") return "payment";
  if (order.status === "delivered") return "delivered";
  return "received";
}
