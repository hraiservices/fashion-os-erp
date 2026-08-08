import { describe, it, expect } from "vitest";
import { resolvePerms, isRestrictedRole, ROLE_DEFAULTS } from "@/lib/permissions";

// Regression guard for the RBAC matrix ported from Stitching_Manager_Pro_v16.html
// ~lines 1991-1996. These exact booleans must never drift silently — a change here
// changes what tailors/sales staff can and cannot do in a live shop.
describe("ROLE_DEFAULTS matrix", () => {
  it("admin has every permission", () => {
    expect(ROLE_DEFAULTS.admin).toEqual({
      addOrder: true,
      deleteOrder: true,
      editOrder: true,
      managePayments: true,
      editMeasurements: true,
      changeStage: true,
      viewReports: true,
      manageCustomers: true,
      manageUsers: true,
      deleteCustomers: true,
      manageInventory: true,
      managePurchases: true,
      manageManufacturing: true,
      manageSales: true,
      useChatbot: true,
      manageEmployees: true,
      usePOS: true,
      managePayroll: true,
    });
  });

  it("manager can't delete orders/customers or manage users", () => {
    expect(ROLE_DEFAULTS.manager).toMatchObject({
      deleteOrder: false,
      manageUsers: false,
      deleteCustomers: false,
      addOrder: true,
      managePayments: true,
      viewReports: true,
    });
  });

  it("sales can't manage payments or view reports", () => {
    expect(ROLE_DEFAULTS.sales).toMatchObject({
      managePayments: false,
      viewReports: false,
      addOrder: true,
      changeStage: true,
    });
  });

  it("tailor can only change stage/manufacturing — everything else is locked down", () => {
    expect(ROLE_DEFAULTS.tailor).toEqual({
      addOrder: false,
      deleteOrder: false,
      editOrder: false,
      managePayments: false,
      editMeasurements: false,
      changeStage: true,
      viewReports: false,
      manageCustomers: false,
      manageUsers: false,
      deleteCustomers: false,
      manageInventory: false,
      managePurchases: false,
      manageManufacturing: true,
      manageSales: false,
      useChatbot: false,
      manageEmployees: false,
      usePOS: false,
      managePayroll: false,
    });
  });
});

describe("resolvePerms", () => {
  it("falls back to tailor defaults for an unknown/missing role", () => {
    expect(resolvePerms("staff")).toEqual(ROLE_DEFAULTS.tailor);
    expect(resolvePerms("")).toEqual(ROLE_DEFAULTS.tailor);
  });

  it("applies a per-user custom_permissions override on top of the role default", () => {
    const perms = resolvePerms("tailor", { viewReports: true });
    expect(perms.viewReports).toBe(true);
    // Everything else should be untouched from the tailor baseline.
    expect(perms.addOrder).toBe(false);
    expect(perms.changeStage).toBe(true);
  });

  it("ignores a null/undefined custom_permissions value", () => {
    expect(resolvePerms("admin", null)).toEqual(ROLE_DEFAULTS.admin);
    expect(resolvePerms("admin", undefined)).toEqual(ROLE_DEFAULTS.admin);
  });
});

describe("isRestrictedRole", () => {
  it("admin and manager are not restricted", () => {
    expect(isRestrictedRole("admin")).toBe(false);
    expect(isRestrictedRole("manager")).toBe(false);
  });

  it("sales, tailor, and any unknown role are restricted", () => {
    expect(isRestrictedRole("sales")).toBe(true);
    expect(isRestrictedRole("tailor")).toBe(true);
    expect(isRestrictedRole("staff")).toBe(true);
    expect(isRestrictedRole("")).toBe(true);
  });

  it("is case- and whitespace-insensitive, mirroring the old app's normalization", () => {
    expect(isRestrictedRole(" Admin ")).toBe(false);
    expect(isRestrictedRole("MANAGER")).toBe(false);
  });
});
