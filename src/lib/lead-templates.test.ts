import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_TEMPLATES, cleanTemplates, fillTemplate } from "@/lib/lead-templates";

describe("fillTemplate", () => {
  it("uses the first name and the product", () => {
    expect(fillTemplate("Hi {name}, about {product}", { name: "Asha Verma", productInterest: "Bridal lehenga" })).toBe("Hi Asha, about Bridal lehenga");
  });
  it("falls back gracefully", () => {
    expect(fillTemplate("Hi {name}, about {product}", { name: " ", productInterest: "" })).toBe("Hi there, about your enquiry");
  });
  it("fills every occurrence, any case", () => {
    expect(fillTemplate("{Name} {name}", { name: "Ravi" })).toBe("Ravi Ravi");
  });
});

describe("cleanTemplates", () => {
  it("falls back to the defaults for junk", () => {
    expect(cleanTemplates(undefined)).toBe(DEFAULT_LEAD_TEMPLATES);
    expect(cleanTemplates("x")).toBe(DEFAULT_LEAD_TEMPLATES);
    expect(cleanTemplates([])).toBe(DEFAULT_LEAD_TEMPLATES);
    expect(cleanTemplates([{ label: "", text: "x" }, null, 5])).toBe(DEFAULT_LEAD_TEMPLATES);
  });
  it("keeps good entries, trims, caps the count and invents missing ids", () => {
    const out = cleanTemplates([{ label: " Hello ", text: " Hi {name} " }, { id: "keep", label: "B", text: "b" }]);
    expect(out).toEqual([{ id: "t1", label: "Hello", text: "Hi {name}" }, { id: "keep", label: "B", text: "b" }]);
    expect(cleanTemplates(Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, text: "t" })))).toHaveLength(12);
  });
});
