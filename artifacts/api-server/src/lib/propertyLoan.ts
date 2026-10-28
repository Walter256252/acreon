import { db, paymentsTable, type Property } from "@workspace/db";
import { eq, desc, lte, and } from "drizzle-orm";
import { propertyLoanSnapshot } from "./loan";

/** A manual balance is a current snapshot. A newer recorded payment supersedes it.
 * Without a snapshot, assume scheduled payments before this month were made.
 */
export async function getPropertyLoan(prop: Property, now = new Date()) {
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.propertyId, prop.id),
        lte(paymentsTable.paymentDate, now.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(desc(paymentsTable.paymentDate), desc(paymentsTable.id))
    .limit(1);
  return propertyLoanSnapshot(prop, payment, now);
}
