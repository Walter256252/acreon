import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable, occupancyRecordsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

// ── GET /api/occupancy ─────────────────────────────────────────────────────
// Returns all properties with their occupancy records
router.get("/occupancy", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const properties = await db
    .select({
      id: propertiesTable.id,
      name: propertiesTable.name,
      address: propertiesTable.address,
      rentalType: propertiesTable.rentalType,
      monthlyRent: propertiesTable.monthlyRent,
    })
    .from(propertiesTable)
    .orderBy(propertiesTable.name);

  if (properties.length === 0) {
    res.json([]);
    return;
  }

  const propIds = properties.map((p) => p.id);
  const records = await db
    .select()
    .from(occupancyRecordsTable)
    .where(inArray(occupancyRecordsTable.propertyId, propIds));

  const result = properties.map((p) => ({
    ...p,
    rentalType: p.rentalType ?? null,
    occupancyRecords: records
      .filter((r) => r.propertyId === p.id)
      .map((r) => ({ period: r.period, occupied: r.occupied })),
  }));

  res.json(result);
});

// ── POST /api/occupancy/record ─────────────────────────────────────────────
// Upsert a single occupancy record (toggle a period)
router.post("/occupancy/record", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { propertyId, period, occupied } = req.body as {
    propertyId?: number;
    period?: string;
    occupied?: boolean;
  };

  if (!propertyId || !period || typeof occupied !== "boolean") {
    res.status(400).json({ error: "propertyId, period, and occupied are required" });
    return;
  }

  await db
    .insert(occupancyRecordsTable)
    .values({ propertyId, period, occupied })
    .onConflictDoUpdate({
      target: [occupancyRecordsTable.propertyId, occupancyRecordsTable.period],
      set: { occupied, updatedAt: new Date() },
    });

  res.json({ ok: true });
});

// ── PATCH /api/properties/:id/rental-type ──────────────────────────────────
// Set the rental type for a property
router.patch("/properties/:id/rental-type", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const { rentalType } = req.body as { rentalType?: string | null };
  const validTypes = ["long-term", "short-term", null];

  if (!validTypes.includes(rentalType ?? null)) {
    res.status(400).json({ error: "rentalType must be 'long-term', 'short-term', or null" });
    return;
  }

  await db
    .update(propertiesTable)
    .set({ rentalType: rentalType ?? null })
    .where(eq(propertiesTable.id, id));

  res.json({ ok: true });
});

export default router;
