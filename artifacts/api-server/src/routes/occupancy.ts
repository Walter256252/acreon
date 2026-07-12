import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { propertiesTable, occupancyRecordsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { openai } from "@workspace/integrations-openai-ai-server";

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
      .map((r) => ({ period: r.period, occupied: r.occupied, nights: r.nights ?? null })),
  }));

  res.json(result);
});

// ── POST /api/occupancy/record ─────────────────────────────────────────────
// Upsert a single occupancy record (toggle a period)
router.post("/occupancy/record", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { propertyId, period, occupied, nights } = req.body as {
    propertyId?: number;
    period?: string;
    occupied?: boolean;
    nights?: number | null;
  };

  if (!propertyId || !period || typeof occupied !== "boolean") {
    res.status(400).json({ error: "propertyId, period, and occupied are required" });
    return;
  }

  await db
    .insert(occupancyRecordsTable)
    .values({ propertyId, period, occupied, nights: nights ?? null })
    .onConflictDoUpdate({
      target: [occupancyRecordsTable.propertyId, occupancyRecordsTable.period],
      set: { occupied, nights: nights ?? null, updatedAt: new Date() },
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

// ── POST /api/occupancy/ai ─────────────────────────────────────────────────
// Natural-language occupancy entry: parse intent → execute DB writes → return summary
router.post("/occupancy/ai", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  // Load current properties for context
  const properties = await db
    .select({ id: propertiesTable.id, name: propertiesTable.name, address: propertiesTable.address, rentalType: propertiesTable.rentalType })
    .from(propertiesTable)
    .orderBy(propertiesTable.name);

  const today = new Date();
  const currentYear = today.getFullYear();
  const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

  const systemPrompt = `You are an occupancy data assistant for a real estate portfolio tracker.
Today is ${today.toDateString()}. The current year is ${currentYear}.

The user's properties are:
${properties.map(p => `  - ID ${p.id}: "${p.name}" (${p.address}) — current rental type: ${p.rentalType ?? "unassigned"}`).join("\n")}

The user will describe occupancy in plain English. Parse their intent and return a JSON object with:
1. "summary": a short plain-English confirmation of what you are doing (1-2 sentences)
2. "actions": an array of action objects to execute

Action types:
- Set rental type: { "type": "set_rental_type", "propertyId": <id>, "rentalType": "long-term" | "short-term" | null }
- Mark LTR months occupied/unoccupied: { "type": "set_ltr_months", "propertyId": <id>, "year": <year>, "months": [1..12], "occupied": true | false }
  - months is an array of month numbers (1=Jan, 12=Dec)
- Set STR nights for specific months: { "type": "set_str_nights", "propertyId": <id>, "year": <year>, "entries": [{ "month": <1-12>, "nights": <0 to days_in_month> }] }

Rules:
- Match property names fuzzily — "downtown condo" matches a property with "Downtown Condo" in the name.
- If the user says "all of <year>" for LTR, include all 12 months.
- If the user says "all of <year>" for STR, fill every month with its max days.
- If rentalType is unassigned and the user implies LTR ("rented", "occupied"), set it to "long-term" first. If STR context is clear ("nights", "Airbnb"), set to "short-term".
- If rentalType is already set, don't change it unless explicitly asked.
- Infer year from context; default to ${currentYear} if not specified.
- Respond ONLY with valid JSON — no markdown, no explanation outside the JSON.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { summary?: string; actions?: unknown[] };
  try { parsed = JSON.parse(raw); } catch { res.status(500).json({ error: "AI returned invalid JSON" }); return; }

  const actions = Array.isArray(parsed.actions) ? parsed.actions as Record<string, unknown>[] : [];
  let applied = 0;

  for (const action of actions) {
    try {
      if (action.type === "set_rental_type") {
        const pid = Number(action.propertyId);
        const rt = (action.rentalType as string | null) ?? null;
        await db.update(propertiesTable).set({ rentalType: rt }).where(eq(propertiesTable.id, pid));
        applied++;
      } else if (action.type === "set_ltr_months") {
        const pid = Number(action.propertyId);
        const yr = Number(action.year) || currentYear;
        const months = Array.isArray(action.months) ? (action.months as number[]) : [];
        const occupied = action.occupied !== false;
        for (const m of months) {
          const period = `${yr}-${String(m).padStart(2, "0")}`;
          await db.insert(occupancyRecordsTable)
            .values({ propertyId: pid, period, occupied })
            .onConflictDoUpdate({
              target: [occupancyRecordsTable.propertyId, occupancyRecordsTable.period],
              set: { occupied, updatedAt: new Date() },
            });
        }
        applied += months.length;
      } else if (action.type === "set_str_nights") {
        const pid = Number(action.propertyId);
        const yr = Number(action.year) || currentYear;
        const entries = Array.isArray(action.entries) ? (action.entries as { month: number; nights: number }[]) : [];
        for (const entry of entries) {
          const period = `${yr}-${String(entry.month).padStart(2, "0")}`;
          const maxDays = daysInMonth(yr, entry.month);
          const nights = Math.max(0, Math.min(entry.nights ?? 0, maxDays));
          await db.insert(occupancyRecordsTable)
            .values({ propertyId: pid, period, occupied: nights > 0, nights })
            .onConflictDoUpdate({
              target: [occupancyRecordsTable.propertyId, occupancyRecordsTable.period],
              set: { occupied: nights > 0, nights, updatedAt: new Date() },
            });
        }
        applied += entries.length;
      }
    } catch (e) {
      // Skip invalid actions, continue with rest
    }
  }

  res.json({ summary: parsed.summary ?? "Done.", applied });
});

export default router;
