/**
 * Fixed vocabularies for the structured product attributes added for Customer Purchase
 * Intelligence (Phase 1). Kept as closed lists — not free text — so the matching engine
 * (Phase 3) can compare values with a plain equality check instead of fuzzy text matching.
 */

export const PRODUCT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free Size"] as const;
export type ProductSize = (typeof PRODUCT_SIZES)[number];

export const PRODUCT_COLORS = [
  "Red", "Maroon", "Pink", "Peach", "Orange", "Yellow", "Mustard", "Green", "Olive",
  "Turquoise", "Blue", "Navy", "Purple", "Wine", "Beige", "Brown", "Grey", "Black",
  "White", "Gold", "Silver", "Multicolor",
] as const;
export type ProductColor = (typeof PRODUCT_COLORS)[number];

export const PRODUCT_FABRICS = [
  "Cotton", "Silk", "Georgette", "Chiffon", "Crepe", "Net", "Velvet", "Linen",
  "Rayon", "Satin", "Organza", "Chanderi", "Banarasi", "Khadi", "Denim", "Polyester",
  "Wool", "Jacquard",
] as const;
export type ProductFabric = (typeof PRODUCT_FABRICS)[number];

export const PRODUCT_PATTERNS = [
  "Plain", "Printed", "Embroidered", "Zari Work", "Sequined", "Block Print",
  "Floral", "Geometric", "Bandhani", "Ikat", "Solid", "Checkered", "Striped",
] as const;
export type ProductPattern = (typeof PRODUCT_PATTERNS)[number];

export const PRODUCT_OCCASIONS = [
  "Daily Wear", "Casual", "Office Wear", "Formal", "Party", "Festive", "Wedding",
] as const;
export type ProductOccasion = (typeof PRODUCT_OCCASIONS)[number];
