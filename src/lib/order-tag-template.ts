// Config for the printable garment-bag tag (src/lib/order-tag.ts) — deliberately much lighter
// than the invoice/stitching-order PDF template system (a single config, not multiple named
// templates): this is a small thermal/label-sized slip for the shop floor, not a document
// customers see, so there's less reason to need more than one variant.

export interface OrderTagTemplateConfig {
  colorTheme: string;
  paperWidthMm: number;
  paperHeightMm: number;
  showShopName: boolean;
  showBarcode: boolean;
  showGarments: boolean;
  showDelivery: boolean;
  showTailor: boolean;
  showSpecialInstructions: boolean;
}

export const DEFAULT_ORDER_TAG_TEMPLATE: OrderTagTemplateConfig = {
  colorTheme: "#111827",
  paperWidthMm: 80,
  paperHeightMm: 120,
  showShopName: true,
  showBarcode: true,
  showGarments: true,
  showDelivery: true,
  showTailor: true,
  showSpecialInstructions: true,
};

/** Backfills any field missing from a saved config — same reasoning as hydrateInvoiceTemplate. */
export function hydrateOrderTagTemplate(t: Partial<OrderTagTemplateConfig> | null | undefined): OrderTagTemplateConfig {
  return { ...DEFAULT_ORDER_TAG_TEMPLATE, ...(t || {}) };
}
