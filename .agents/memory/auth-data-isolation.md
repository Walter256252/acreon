---
name: Auth & data isolation
description: How Clerk auth and per-user data scoping work in Acreon
---

## Rule
All API routes except `/health` are protected by a global `requireAuth` middleware in `artifacts/api-server/src/routes/index.ts`. Every query that returns or modifies user-owned data filters by `clerkUserId` (properties) or `userId` (conversations, settings, email, etc.).

**Why:** The properties table originally had no userId column, so all users shared the same data. The fix added `clerk_user_id` TEXT column to `properties` and `user_id` TEXT column to `conversations` via raw SQL migrations.

**How to apply:**
- New properties are inserted with `clerkUserId: userId` (from `getAuth(req).userId`).
- All SELECT/UPDATE/DELETE on properties use `and(eq(propertiesTable.id, id), eq(propertiesTable.clerkUserId, userId))`.
- Dashboard, projections, occupancy, propertiesGeo, openai all filter properties by `clerkUserId`.
- Payments/amortization verify property ownership before accessing payment records.
- The health router is registered BEFORE `requireAuth` in routes/index.ts so monitoring stays public.
- Frontend is already fully wired (ClerkProvider, sign-in/sign-up pages, `<Show when>` guards, `OnboardingGate`). Do not add token auth to browser fetch — Clerk uses session cookies on web.
