import assert from "node:assert/strict";
import { test } from "node:test";
import { updateReviewStatus } from "../../realestate-tracker/src/lib/review-status.ts";

test("review status rejects HTTP errors, including non-JSON error responses", async () => {
  for (const status of [400, 401, 403, 500]) {
    const request = (async () =>
      new Response("Server error", { status })) as typeof fetch;
    await assert.rejects(
      updateReviewStatus(1, true, request),
      /Could not save review status/,
    );
  }
});
test("review status only resolves on success and sends the expected update", async () => {
  const request = (async (url, options) => {
    assert.equal(url, "/api/finances/transactions/42");
    assert.equal(options?.method, "PUT");
    assert.deepEqual(JSON.parse(String(options?.body)), { isReviewed: true });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await updateReviewStatus(42, true, request);
  await assert.rejects(
    updateReviewStatus(42, true, (async () => {
      throw Error("Offline");
    }) as typeof fetch),
    /Offline/,
  );
});
