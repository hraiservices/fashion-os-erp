import { describe, it, expect, afterEach, vi } from "vitest";
import { isNetworkError, getErrorMessage, rethrowFriendly, OFFLINE_MESSAGE } from "./error-message";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isNetworkError", () => {
  it("is true for a fetch-style TypeError", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource"))).toBe(true);
  });

  it("is false for an unrelated TypeError", () => {
    expect(isNetworkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("is false for a normal server-side Error", () => {
    expect(isNetworkError(new Error("Order not found"))).toBe(false);
  });

  it("is true whenever the browser reports offline, regardless of the error", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkError(new Error("Order not found"))).toBe(true);
  });
});

describe("getErrorMessage", () => {
  it("returns the offline message for a network error", () => {
    expect(getErrorMessage(new TypeError("Failed to fetch"), "Failed to save")).toBe(OFFLINE_MESSAGE);
  });

  it("returns the error's own message otherwise", () => {
    expect(getErrorMessage(new Error("Order not found"), "Failed to save")).toBe("Order not found");
  });

  it("falls back for a non-Error throw", () => {
    expect(getErrorMessage("boom", "Failed to save")).toBe("Failed to save");
  });
});

describe("rethrowFriendly", () => {
  it("rethrows a network error as a friendly Error", () => {
    expect(() => rethrowFriendly(new TypeError("Failed to fetch"))).toThrow(OFFLINE_MESSAGE);
  });

  it("rethrows anything else unchanged", () => {
    const original = new Error("Order not found");
    expect(() => rethrowFriendly(original)).toThrow(original);
  });
});
