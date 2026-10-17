import { z } from "zod";

/** The public enquiry form's fields — shared by the page and the API so they can't drift apart. */
export const ENQUIRY_SOURCES = ["Instagram", "Facebook", "Counter QR", "WhatsApp status", "Website"] as const;

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  mobile: z.string().trim().min(10, "Please enter your 10-digit mobile number").max(20),
  looking: z.string().trim().max(200).default(""),
  neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  message: z.string().trim().max(600).default(""),
  source: z.string().trim().max(40).default("Website"),
  /** Honeypot: real visitors never see or fill this; bots do. */
  website: z.string().max(200).optional(),
});
export type EnquiryInput = z.infer<typeof enquirySchema>;

export const enquiryUrl = (origin: string, source: string) => `${origin}/enquiry?src=${encodeURIComponent(source)}`;
