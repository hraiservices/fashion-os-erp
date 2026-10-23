/** Fashion Flow's own support contact — shared by the desktop footer and the Get Support tab so
 *  there's one place to update if it ever changes. */
export const SUPPORT_EMAIL = "connect@fashionflow.app";
export const SUPPORT_PHONE = "+919897504343";
export const SUPPORT_WEBSITE = "https://www.fashionflow.app";

/** wa.me expects digits only, no "+". */
export function supportWhatsAppHref(): string {
  return `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, "")}`;
}
