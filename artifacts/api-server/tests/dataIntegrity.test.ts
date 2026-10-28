import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTxBody, debtComponent } from "../src/lib/financeValidation.ts";
import { validateOccupancyActions } from "../src/lib/occupancyValidation.ts";

test("review-only update preserves every omitted field", () => {
  const patch = parseTxBody({ isReviewed: true }, false);
  assert.deepEqual(patch, { isReviewed: true });
  const existing = {
    propertyId: 1,
    vendorPayer: "Vendor",
    paymentAccount: "Bank",
    notes: "Keep",
    rentalType: "long_term",
    taxYear: 2026,
  };
  assert.deepEqual(
    { ...existing, ...patch },
    { ...existing, isReviewed: true },
  );
});
test("explicit null clears optional fields while omitted fields remain absent", () => {
  assert.deepEqual(
    parseTxBody({ propertyId: null, notes: null, taxYear: null }, false),
    { propertyId: null, notes: null, taxYear: null },
  );
});
test("create and update reject malformed transaction values", () => {
  const valid = {
    date: "2026-10-01",
    description: "Rent",
    amount: 1000,
    type: "income",
    category: "Rental Income",
  };
  for (const patch of [
    { amount: -1 },
    { amount: 0 },
    { amount: NaN },
    { amount: Infinity },
    { amount: "100" },
    { type: "unknown" },
    { date: "2026-02-30" },
    { date: "bad" },
    { propertyId: -1 },
    { propertyId: 1.5 },
    { category: " " },
    { isReviewed: "yes" },
    { taxYear: 1.5 },
    { rentalType: "bad" },
  ]) {
    assert.throws(() => parseTxBody(patch, false));
    assert.throws(() => parseTxBody({ ...valid, ...patch }));
  }
  assert.deepEqual(parseTxBody(valid), valid);
  assert.throws(() => parseTxBody(null, false));
  assert.throws(() => parseTxBody([]));
  assert.throws(() => parseTxBody({}));
  assert.equal(parseTxBody({ date: "2028-02-29" }, false).date, "2028-02-29");
});
test("principal totals never count escrow, PMI, fees, or combined payments", () => {
  for (const category of ["Principal", "Principal Payment"])
    assert.equal(debtComponent(category), "principal");
  for (const category of ["Interest", "Interest Payment", "Mortgage Interest"])
    assert.equal(debtComponent(category), "interest");
  for (const category of [
    "Escrow",
    "PMI",
    "Loan Fees",
    "Mortgage Payment (Combined)",
    "HELOC Payment",
  ])
    assert.equal(debtComponent(category), "other");
});
test("AI ownership validation rejects both long-term and short-term writes to foreign properties", () => {
  for (const action of [
    { type: "set_ltr_months", year: 2026, months: [10], occupied: true },
    { type: "set_str_nights", year: 2026, entries: [{ month: 10, nights: 2 }] },
    { type: "set_rental_type", rentalType: "long-term" },
  ]) {
    assert.throws(
      () =>
        validateOccupancyActions(
          [{ ...action, propertyId: 999 }],
          new Set([1]),
        ),
      (error: unknown) => (error as { status: number }).status === 403,
    );
    assert.equal(
      validateOccupancyActions([{ ...action, propertyId: 1 }], new Set([1]))
        .length,
      1,
    );
  }
});
test("entire AI batch is validated before any action is returned for execution", () => {
  assert.throws(() =>
    validateOccupancyActions(
      [
        { type: "set_rental_type", propertyId: 1, rentalType: "long-term" },
        {
          type: "set_ltr_months",
          propertyId: 999,
          year: 2026,
          months: [1],
          occupied: true,
        },
      ],
      new Set([1]),
    ),
  );
});
test("AI occupancy rejects invalid calendar data and permits leap-year nights", () => {
  for (const action of [
    { type: "set_ltr_months", year: 2026, months: [13], occupied: true },
    { type: "set_ltr_months", year: 2026, months: [1], occupied: "false" },
    { type: "set_str_nights", year: 2026, entries: [{ month: 2, nights: 29 }] },
    {
      type: "set_str_nights",
      year: 2026,
      entries: [{ month: 1, nights: 1.5 }],
    },
    { type: "set_str_nights", year: 2026, entries: [null] },
    { type: "unknown" },
  ])
    assert.throws(() =>
      validateOccupancyActions([{ ...action, propertyId: 1 }], new Set([1])),
    );
  assert.equal(
    validateOccupancyActions(
      [
        {
          type: "set_str_nights",
          propertyId: 1,
          year: 2028,
          entries: [{ month: 2, nights: 29 }],
        },
      ],
      new Set([1]),
    ).length,
    1,
  );
});

test("date edits move transactions to the new tax year unless explicitly overridden", async () => {
  const { taxYearForUpdate } = await import("../src/lib/financeValidation.ts");
  assert.equal(
    taxYearForUpdate(parseTxBody({ date: "2025-12-31" }, false)),
    2025,
  );
  assert.equal(
    taxYearForUpdate(parseTxBody({ date: "2025-12-31", taxYear: 2024 }, false)),
    2024,
  );
  assert.equal(
    taxYearForUpdate(parseTxBody({ date: "2025-12-31", taxYear: null }, false)),
    null,
  );
  assert.equal(
    taxYearForUpdate(parseTxBody({ isReviewed: true }, false)),
    undefined,
  );
  assert.equal(
    taxYearForUpdate(
      parseTxBody({ date: "2025-12-31", description: "Changed" }, false),
      "2025-12-31",
    ),
    undefined,
  );
});
