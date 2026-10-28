export class OccupancyActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
/** Validate the whole proposed batch before performing any writes. */
export function validateOccupancyActions(
  value: unknown,
  ownedIds: Set<number>,
): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new OccupancyActionError("Invalid occupancy actions");
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new OccupancyActionError("Invalid occupancy action");
    const action = entry as Record<string, unknown>;
    if (
      !Number.isInteger(action.propertyId) ||
      !ownedIds.has(action.propertyId as number)
    )
      throw new OccupancyActionError(
        "Property not found or access denied",
        403,
      );
    if (action.type === "set_rental_type") {
      if (
        !["long-term", "short-term", null].includes(
          action.rentalType as string | null,
        )
      )
        throw new OccupancyActionError("Invalid rental type");
      continue;
    }
    if (!["set_ltr_months", "set_str_nights"].includes(action.type as string))
      throw new OccupancyActionError("Unknown occupancy action");
    if (
      typeof action.year !== "number" ||
      !Number.isInteger(action.year) ||
      action.year < 1900 ||
      action.year > 9999
    )
      throw new OccupancyActionError("Invalid occupancy year");
    const validMonth = (month: unknown) =>
      typeof month === "number" &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12;
    if (action.type === "set_ltr_months") {
      if (
        typeof action.occupied !== "boolean" ||
        !Array.isArray(action.months) ||
        action.months.length > 12 ||
        !action.months.every(validMonth)
      )
        throw new OccupancyActionError("Invalid occupancy months");
    } else {
      if (!Array.isArray(action.entries) || action.entries.length > 12)
        throw new OccupancyActionError("Invalid occupancy nights");
      for (const item of action.entries) {
        if (
          !item ||
          !validMonth(item.month) ||
          !Number.isInteger(item.nights) ||
          item.nights < 0 ||
          item.nights >
            new Date(Date.UTC(action.year, item.month, 0)).getUTCDate()
        )
          throw new OccupancyActionError("Invalid occupancy nights");
      }
    }
  }
  return value as Record<string, unknown>[];
}
