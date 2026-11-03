import { BarChart3, Scissors, ShoppingCart, Users, Package, Truck, Factory, Wallet, type LucideIcon } from "lucide-react";

export const FAVORITES_CATEGORY = "__favorites__";

export const SECTION_ICON: Record<string, LucideIcon> = {
  Summary: BarChart3,
  "Stitching Orders": Scissors,
  Sales: ShoppingCart,
  Customers: Users,
  Inventory: Package,
  Purchases: Truck,
  Expenses: Wallet,
  Manufacturing: Factory,
};
