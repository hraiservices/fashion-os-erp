import { describe, it, expect } from "vitest";
import { computeCogs, creditNoteTax, type SalesLineItem } from "@/lib/sales";
import { computeGst } from "@/lib/gst";

/** Regression cover for the accounting corrections from the ERP forensic audit. Each test pins
 *  the specific wrong behaviour that was found, so a future refactor can't quietly restore it. */

function line(over: Partial<SalesLineItem>): SalesLineItem {
  return { productId: "p1", productName: "Suit", qty: 1, unitPrice: 100, discountPercent: 0, amount: 100, ...over };
}

describe("computeCogs — cost of goods SOLD, not goods bought", () => {
  it("costs each line at qty × its frozen cost price", () => {
    const { cogs, unknownCostLines } = computeCogs([
      line({ qty: 2, costPrice: 50 }),
      line({ qty: 3, costPrice: 10 }),
    ]);
    expect(cogs).toBe(130);
    expect(unknownCostLines).toBe(0);
  });

  it("excludes lines with no recorded cost instead of costing them at zero", () => {
    // The whole point: a legacy line with no costPrice is "we don't know", not "it was free".
    // Counting it as 0 would report 100% margin on that line — the exact failure lineItemMargin
    // refuses to make, and the reason the P&L surfaces unknownCostLines to the user.
    const { cogs, unknownCostLines } = computeCogs([line({ qty: 2, costPrice: 50 }), line({ qty: 5 })]);
    expect(cogs).toBe(100);
    expect(unknownCostLines).toBe(1);
  });

  it("treats a genuinely zero cost differently from an unrecorded one", () => {
    expect(computeCogs([line({ qty: 4, costPrice: 0 })])).toEqual({ cogs: 0, unknownCostLines: 0 });
    expect(computeCogs([line({ qty: 4 })])).toEqual({ cogs: 0, unknownCostLines: 1 });
  });

  it("rounds to paise rather than carrying float noise into the P&L", () => {
    expect(computeCogs([line({ qty: 3, costPrice: 0.1 })]).cogs).toBe(0.3);
  });

  it("is empty-safe", () => {
    expect(computeCogs([])).toEqual({ cogs: 0, unknownCostLines: 0 });
  });
});

describe("creditNoteTax — credit notes reverse output tax", () => {
  it("reverses tax at the parent invoice's own rate and split", () => {
    // sales_credit_notes stores only a total, so the tax to reverse has to come from the invoice
    // it credits. A 5% intra-state sale returned for ₹1,000 gives back ₹25 CGST + ₹25 SGST.
    const tax = creditNoteTax(1000, 5, "intra");
    expect(tax.taxableAmount).toBe(1000);
    expect(tax.cgst).toBe(25);
    expect(tax.sgst).toBe(25);
    expect(tax.igst).toBe(0);
    expect(tax.totalTax).toBe(50);
  });

  it("reverses inter-state credits as IGST", () => {
    const tax = creditNoteTax(1000, 12, "inter");
    expect(tax.igst).toBe(120);
    expect(tax.cgst).toBe(0);
    expect(tax.sgst).toBe(0);
  });

  it("reverses nothing when the sale carried no GST", () => {
    const tax = creditNoteTax(5000, 0, "none");
    expect(tax.totalTax).toBe(0);
  });

  it("exactly offsets the tax the invoice charged when the whole sale is returned", () => {
    // The property that matters for GSTR-1: a full return must net output tax to zero, not
    // leave a residue from rounding the two sides differently.
    const invoiceTax = computeGst(2499.5, 18, "intra");
    const reversal = creditNoteTax(2499.5, 18, "intra");
    expect(invoiceTax.cgst - reversal.cgst).toBe(0);
    expect(invoiceTax.sgst - reversal.sgst).toBe(0);
    expect(invoiceTax.totalTax - reversal.totalTax).toBe(0);
  });

  it("never reverses tax on a negative total", () => {
    expect(creditNoteTax(-500, 18, "intra").totalTax).toBe(0);
  });
});
