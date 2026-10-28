/** Reject HTTP errors so React Query invokes onError rather than onSuccess. */
export async function updateReviewStatus(
  id: number,
  isReviewed: boolean,
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await request(`/api/finances/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isReviewed }),
  });
  if (!response.ok)
    throw new Error("Could not save review status. Please try again.");
}
