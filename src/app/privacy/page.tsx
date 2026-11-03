import type { Metadata } from "next";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Fashion Flow";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@fashionflow.app";
const LAST_UPDATED = "28 October 2026";

export const metadata: Metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
  description: `How ${APP_NAME} collects, stores and protects data.`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/**
 * Public, unauthenticated page — required by the Play Store listing (Data Safety section links
 * here) and by Apple's App Store Connect if this ever ships there too. Static/server-rendered,
 * no Supabase read: every deployment of this app is a separate customer's own instance (one
 * Supabase project per shop — see capacitor.config.ts and docs/customer-onboarding.md), so this
 * describes the platform's data-handling model in general terms rather than any one shop's data,
 * and reads identically on every deployment without per-shop wiring.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">{APP_NAME} Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8">
        <Section title="Overview">
          <p>
            {APP_NAME} is a business-management app used by tailoring and boutique shops to manage their own orders, customers, inventory,
            billing and staff. This policy explains what data the app collects, how it is stored, and how it is used — whether you are using
            {` ${APP_NAME}`} as a shop owner/staff member, or you are a shop&apos;s customer whose details a shop has entered into the app.
          </p>
          <p>
            Each shop that uses {APP_NAME} has its own private, isolated database. Your shop&apos;s data is never shared with, mixed with, or
            visible to any other shop using the app.
          </p>
        </Section>

        <Section title="Who controls your data">
          <p>
            If you are a shop owner or staff member, you (the shop) are the data controller for the customer, order and staff information you
            enter into the app — {APP_NAME} is a data processor acting on your instructions. If you are a shop&apos;s customer, the shop you
            engaged with controls your data; contact that shop directly for requests about your own information.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>Depending on how a shop uses the app, the following may be collected and stored in that shop&apos;s own database:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Account information:</strong> name, email address, mobile number, and password (stored securely, hashed — never in plain text) for shop owners and staff who sign in.</li>
            <li><strong>Customer and order records:</strong> customer names, mobile numbers, addresses, measurements, order details, photos of garments/work-in-progress, and payment/billing history that a shop enters.</li>
            <li><strong>Staff attendance location:</strong> if a shop enables check-in location tracking, the device&apos;s GPS location is recorded at the moment of check-in/check-out, for that staff member&apos;s own attendance record.</li>
            <li><strong>Photos:</strong> images taken via the in-app camera (e.g. garment reference photos) or uploaded, stored in the shop&apos;s private file storage.</li>
            <li><strong>Push notification token:</strong> a device identifier used only to deliver that shop&apos;s own notifications (e.g. order updates) to its own users — not used for advertising or cross-app tracking.</li>
            <li><strong>Usage data:</strong> basic technical logs (errors, performance) used to keep the app working reliably.</li>
          </ul>
        </Section>

        <Section title="How information is used">
          <ul className="list-disc space-y-1 pl-5">
            <li>To operate the core features of the app for the shop that entered the data — orders, billing, customer records, staff management, reporting.</li>
            <li>To send the shop&apos;s own push notifications and WhatsApp messages the shop initiates (e.g. order-ready alerts) to that shop&apos;s customers.</li>
            <li>To provide optional AI-assisted features (e.g. smart search, content suggestions) a shop may enable — these send only the relevant text/data needed for that feature to a third-party AI provider for processing, and are not used to train models on a shop&apos;s private data.</li>
            <li>To diagnose and fix bugs.</li>
          </ul>
          <p>We do not sell any data, and we do not use shop or customer data for advertising.</p>
        </Section>

        <Section title="Where data is stored">
          <p>
            Each shop&apos;s data is stored in that shop&apos;s own dedicated Supabase (PostgreSQL) database and file storage, isolated from
            every other shop. Data is encrypted in transit (HTTPS/TLS) and at rest.
          </p>
        </Section>

        <Section title="Data sharing">
          <p>
            We do not share shop or customer data with third parties, except: (a) infrastructure providers that host the app and database
            (Supabase, Vercel) strictly to provide the service, (b) an AI provider for the specific optional AI features a shop enables, and
            (c) when required by law.
          </p>
        </Section>

        <Section title="Your choices and rights">
          <ul className="list-disc space-y-1 pl-5">
            <li>Location access for staff check-in is only requested when that feature is used, and only while the app is active for that action.</li>
            <li>Camera access is only requested when you choose to take a photo in the app.</li>
            <li>Push notifications can be turned off in your device settings at any time.</li>
            <li>To request access to, correction of, or deletion of your data, contact the shop you interacted with, or email us at {SUPPORT_EMAIL} and we will route the request appropriately.</li>
          </ul>
        </Section>

        <Section title="Data retention">
          <p>
            Data is retained for as long as a shop maintains an active account, so records remain usable for that shop&apos;s own business
            operations. A shop can request deletion of its account and data at any time by contacting us.
          </p>
        </Section>

        <Section title="Children">
          <p>{APP_NAME} is a business tool intended for shop owners, staff, and their adult customers. It is not directed at children, and we do not knowingly collect data from children.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>We may update this policy from time to time. Material changes will be reflected by updating the &quot;Last updated&quot; date above.</p>
        </Section>

        <Section title="Contact us">
          <p>
            Questions about this policy or your data? Email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
