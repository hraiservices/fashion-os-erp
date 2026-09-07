// Named measurement profiles — lets a customer have several saved sets of measurements
// ("Regular fit", "Loose fit", "Wedding suit") instead of one flat set that silently loses
// whichever fit wasn't saved most recently. Staff name profiles themselves; nothing here is
// auto-generated. See supabase/migrations/add_measurement_profiles.sql for the storage shape.
import type { Json } from "@/lib/supabase/database.types";

export interface MeasurementProfile {
  id: string;
  name: string;
  values: Record<string, string>;
  updatedAt: string;
  /** At most one profile per customer should have this true — the one that auto-loads without
   *  staff having to pick from the dropdown. */
  isDefault?: boolean;
  /** Hidden from the picker but not deleted — a profile tied to real garments already made
   *  shouldn't just vanish because it's no longer the customer's current fit. */
  archived?: boolean;
}

function newProfileId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Reads a customer's saved profiles, falling back to a single synthesized "Default" profile
 *  built from the legacy flat `measurements` column for any customer who predates this feature
 *  (or has simply never engaged with it) — so every existing customer with saved measurements
 *  still has something to load, with zero migration/backfill required. */
export function getProfiles(customer: {
  measurements: Record<string, unknown>;
  measurementProfiles: MeasurementProfile[];
  createdAt: string;
}): MeasurementProfile[] {
  if (customer.measurementProfiles && customer.measurementProfiles.length > 0) return customer.measurementProfiles;
  const legacy = customer.measurements as Record<string, string> | undefined;
  if (legacy && Object.keys(legacy).length > 0) {
    return [{ id: "legacy", name: "Default", values: legacy, updatedAt: customer.createdAt, isDefault: true }];
  }
  return [];
}

export function activeProfiles(profiles: MeasurementProfile[]): MeasurementProfile[] {
  return profiles.filter((p) => !p.archived);
}

export function findProfile(profiles: MeasurementProfile[], id: string): MeasurementProfile | undefined {
  return profiles.find((p) => p.id === id);
}

/** The profile that should load automatically without staff picking — the one marked default,
 *  or (for a customer who's never set one) simply the first active profile, so a customer with
 *  exactly one profile behaves exactly like the old single-measurements flow. */
export function defaultProfile(profiles: MeasurementProfile[]): MeasurementProfile | undefined {
  const active = activeProfiles(profiles);
  return active.find((p) => p.isDefault) ?? active[0];
}

/** Creates or overwrites a profile by id (rename/edit an existing one) or, with no id, appends
 *  a brand-new one — the single function every save action (new profile, update existing,
 *  rename, archive, set-default) goes through, so the "exactly one isDefault" invariant is
 *  enforced in one place. */
export function upsertProfile(
  profiles: MeasurementProfile[],
  input: { id?: string; name: string; values: Record<string, string>; isDefault?: boolean }
): MeasurementProfile[] {
  const now = new Date().toISOString();
  const existingIndex = input.id ? profiles.findIndex((p) => p.id === input.id) : -1;
  const next: MeasurementProfile = {
    id: existingIndex >= 0 ? profiles[existingIndex].id : newProfileId(),
    name: input.name,
    values: input.values,
    updatedAt: now,
    isDefault: !!input.isDefault,
  };
  let out = existingIndex >= 0 ? profiles.map((p, i) => (i === existingIndex ? next : p)) : [...profiles, next];
  if (next.isDefault) out = out.map((p) => (p.id === next.id ? p : { ...p, isDefault: false }));
  return out;
}

export function renameProfile(profiles: MeasurementProfile[], id: string, name: string): MeasurementProfile[] {
  return profiles.map((p) => (p.id === id ? { ...p, name } : p));
}

export function setArchived(profiles: MeasurementProfile[], id: string, archived: boolean): MeasurementProfile[] {
  return profiles.map((p) => (p.id === id ? { ...p, archived, isDefault: archived ? false : p.isDefault } : p));
}

export function setDefaultProfile(profiles: MeasurementProfile[], id: string): MeasurementProfile[] {
  return profiles.map((p) => ({ ...p, isDefault: p.id === id }));
}

/** For the zod schema on the API route and for writing to the jsonb column. */
export function toJson(profiles: MeasurementProfile[]): Json {
  return profiles as unknown as Json;
}
