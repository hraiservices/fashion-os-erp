/**
 * Resizes an image file client-side (via canvas) and returns it as a JPEG data URL — the shop
 * logo/favicon upload flow (src/components/settings/shop-section.tsx) immediately uploads this
 * to the branding-media Storage bucket (see src/lib/supabase/branding-storage.ts) rather than
 * keeping the data URL itself, but the resize still matters: it's what's actually uploaded, and
 * a smaller file is a smaller/faster upload. Invoice/stitching-order template logos and
 * signatures still use the raw data URL inline in app_settings JSONB — lower traffic (fetched
 * only by settings pages and PDF generation, not on every navigation), not yet migrated.
 */
export function fileToDataUrl(file: File, maxDimension = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
