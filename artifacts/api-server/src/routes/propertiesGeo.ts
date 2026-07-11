import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { propertiesTable, propertyGeocodesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { buildAmortizationSchedule } from "./payments";

const router: IRouter = Router();

function uid(req: Request) {
  return getAuth(req).userId ?? null;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const user = await clerkClient.users.getUser(userId);
    if (user.publicMetadata?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" }); return;
    }
    next();
  } catch {
    res.status(403).json({ error: "Admin access required" });
  }
}

// Nominatim geocode with a simple retry
async function geocodeAddress(address: string): Promise<{
  lat: number; lng: number; city: string | null; state: string | null;
  country: string | null; displayName: string | null;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "RealTrack-Admin/1.0 (realestate-tracker)" },
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<{
      lat: string; lon: string; display_name: string;
      address?: { city?: string; town?: string; village?: string; state?: string; country?: string };
    }>;
    if (!data.length) return null;
    const r = data[0];
    const addr = r.address ?? {};
    return {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      city: addr.city ?? addr.town ?? addr.village ?? null,
      state: addr.state ?? null,
      country: addr.country ?? null,
      displayName: r.display_name ?? null,
    };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// GET /api/admin/properties-geo
// Returns all properties with lat/lng (geocoded + cached) plus state-level aggregates.
router.get("/admin/properties-geo", requireAdmin, async (_req, res) => {
  const allProperties = await db.select().from(propertiesTable);
  if (!allProperties.length) {
    res.json({ properties: [], byState: [] });
    return;
  }

  const propIds = allProperties.map(p => p.id);
  const cached = await db.select().from(propertyGeocodesTable).where(inArray(propertyGeocodesTable.propertyId, propIds));
  const cachedMap = new Map(cached.map(c => [c.propertyId, c]));

  // Geocode any that aren't cached yet
  const uncached = allProperties.filter(p => !cachedMap.has(p.id));
  for (const prop of uncached) {
    const geo = await geocodeAddress(prop.address);
    if (geo) {
      const [inserted] = await db.insert(propertyGeocodesTable).values({
        propertyId: prop.id,
        lat: String(geo.lat),
        lng: String(geo.lng),
        city: geo.city,
        state: geo.state,
        country: geo.country,
        displayName: geo.displayName,
      }).onConflictDoUpdate({
        target: propertyGeocodesTable.propertyId,
        set: {
          lat: String(geo.lat),
          lng: String(geo.lng),
          city: geo.city,
          state: geo.state,
          country: geo.country,
          displayName: geo.displayName,
        },
      }).returning();
      if (inserted) cachedMap.set(prop.id, inserted);
    }
    // Nominatim rate limit: max 1 req/sec
    await sleep(1100);
  }

  // Build per-property result with equity
  const now = new Date();
  const properties = allProperties.map(prop => {
    const geo = cachedMap.get(prop.id);

    const start = new Date(prop.loanStartDate);
    const monthsElapsed =
      (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    const savedExtras =
      (prop.savedExtraPayments as Array<{ paymentNumber: number; amount: number }> | null) ?? [];
    const schedule = buildAmortizationSchedule({
      loanAmount: Number(prop.loanAmount),
      interestRate: Number(prop.interestRate),
      loanTermYears: prop.loanTermYears,
      loanStartDate: prop.loanStartDate,
      monthlyPayment: Number(prop.monthlyPayment),
      extraPaymentMonthly: prop.savedExtraMonthly != null ? Number(prop.savedExtraMonthly) : 0,
      extraPayments: savedExtras,
      startingBalance: prop.currentLoanBalance != null ? Number(prop.currentLoanBalance) : undefined,
    });
    const idx = Math.max(0, Math.min(monthsElapsed - 1, schedule.length - 1));
    const balance = monthsElapsed <= 0
      ? (prop.currentLoanBalance != null ? Number(prop.currentLoanBalance) : Number(prop.loanAmount))
      : (schedule[idx]?.remainingBalance ?? 0);
    const currentValue = Number(prop.currentValue);
    const equity = currentValue - balance;

    return {
      id: prop.id,
      name: prop.name,
      address: prop.address,
      currentValue: round2(currentValue),
      equity: round2(equity),
      loanBalance: round2(balance),
      lat: geo ? parseFloat(String(geo.lat)) : null,
      lng: geo ? parseFloat(String(geo.lng)) : null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      country: geo?.country ?? null,
    };
  });

  // Aggregate by state
  const stateMap = new Map<string, {
    state: string; count: number; totalValue: number; totalEquity: number; totalDebt: number;
  }>();
  for (const p of properties) {
    const key = p.state ?? "Unknown";
    const existing = stateMap.get(key) ?? { state: key, count: 0, totalValue: 0, totalEquity: 0, totalDebt: 0 };
    existing.count += 1;
    existing.totalValue += p.currentValue;
    existing.totalEquity += p.equity;
    existing.totalDebt += p.loanBalance;
    stateMap.set(key, existing);
  }
  const byState = Array.from(stateMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .map(s => ({
      state: s.state,
      count: s.count,
      totalValue: round2(s.totalValue),
      totalEquity: round2(s.totalEquity),
      totalDebt: round2(s.totalDebt),
    }));

  res.json({ properties, byState });
});

export default router;
