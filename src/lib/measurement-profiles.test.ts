import { describe, it, expect } from "vitest";
import { getProfiles, activeProfiles, findProfile, defaultProfile, upsertProfile, renameProfile, setArchived, setDefaultProfile } from "@/lib/measurement-profiles";

describe("getProfiles", () => {
  it("returns the saved array when non-empty", () => {
    const profiles = [{ id: "p1", name: "Regular", values: { chest: "40" }, updatedAt: "2024-01-01" }];
    expect(getProfiles({ measurements: {}, measurementProfiles: profiles, createdAt: "2023-01-01" })).toBe(profiles);
  });

  it("synthesizes a legacy Default profile from the flat measurements column", () => {
    const result = getProfiles({ measurements: { chest: "40" }, measurementProfiles: [], createdAt: "2023-01-01" });
    expect(result).toEqual([{ id: "legacy", name: "Default", values: { chest: "40" }, updatedAt: "2023-01-01", isDefault: true }]);
  });

  it("returns an empty array for a customer with neither", () => {
    expect(getProfiles({ measurements: {}, measurementProfiles: [], createdAt: "2023-01-01" })).toEqual([]);
  });
});

describe("upsertProfile / defaultProfile invariant", () => {
  it("appends a new profile without an id", () => {
    const out = upsertProfile([], { name: "Regular fit", values: { chest: "40" } });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Regular fit");
  });

  it("enforces exactly one isDefault across the array", () => {
    let profiles = upsertProfile([], { name: "Regular fit", values: {}, isDefault: true });
    profiles = upsertProfile(profiles, { name: "Loose fit", values: {}, isDefault: true });
    expect(profiles.filter((p) => p.isDefault)).toHaveLength(1);
    expect(profiles.find((p) => p.name === "Loose fit")?.isDefault).toBe(true);
  });

  it("overwrites in place when an id matches an existing profile", () => {
    const first = upsertProfile([], { name: "Regular fit", values: { chest: "40" } });
    const second = upsertProfile(first, { id: first[0].id, name: "Regular fit", values: { chest: "42" } });
    expect(second).toHaveLength(1);
    expect(second[0].values.chest).toBe("42");
  });
});

describe("archive / rename / setDefault", () => {
  const base = upsertProfile([], { name: "Regular fit", values: {}, isDefault: true });

  it("archiving clears isDefault and hides it from activeProfiles", () => {
    const archived = setArchived(base, base[0].id, true);
    expect(archived[0].isDefault).toBe(false);
    expect(activeProfiles(archived)).toHaveLength(0);
  });

  it("renaming doesn't touch other fields", () => {
    const renamed = renameProfile(base, base[0].id, "Wedding suit");
    expect(renamed[0].name).toBe("Wedding suit");
    expect(renamed[0].isDefault).toBe(true);
  });

  it("setDefaultProfile moves the flag to exactly the named profile", () => {
    const two = upsertProfile(base, { name: "Loose fit", values: {} });
    const moved = setDefaultProfile(two, two[1].id);
    expect(moved.find((p) => p.isDefault)?.name).toBe("Loose fit");
  });

  it("findProfile / defaultProfile", () => {
    expect(findProfile(base, base[0].id)?.name).toBe("Regular fit");
    expect(defaultProfile(base)?.name).toBe("Regular fit");
    // With no isDefault set anywhere, falls back to the first active profile.
    const noDefault = [{ ...base[0], isDefault: false }];
    expect(defaultProfile(noDefault)?.id).toBe(base[0].id);
  });
});
