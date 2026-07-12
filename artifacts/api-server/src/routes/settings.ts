import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { userPreferencesTable, feedbackTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateDigest, sendMonthlyDigest } from "../lib/digestSender";

const router: IRouter = Router();

function uid(req: Parameters<typeof getAuth>[0]) {
  return getAuth(req).userId ?? null;
}

// GET /user/preferences
router.get("/user/preferences", async (req, res) => {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [pref] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));

  res.json({
    monthlyDigestEnabled: pref?.monthlyDigestEnabled ?? false,
    lastDigestSentAt: pref?.lastDigestSentAt?.toISOString() ?? null,
  });
});

// PUT /user/preferences
router.put("/user/preferences", async (req, res) => {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { monthlyDigestEnabled } = req.body as { monthlyDigestEnabled: boolean };

  await db
    .insert(userPreferencesTable)
    .values({ userId, monthlyDigestEnabled: !!monthlyDigestEnabled })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: { monthlyDigestEnabled: !!monthlyDigestEnabled, updatedAt: new Date() },
    });

  res.json({ success: true });
});

// POST /user/digest/preview — generate content without sending
router.post("/user/digest/preview", async (req, res) => {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const user = await clerkClient.users.getUser(userId);
  const firstName = user.firstName ?? "there";
  const content = await generateDigest(userId, firstName);
  res.json(content);
});

// POST /user/digest/send — generate + send to user's Clerk email
router.post("/user/digest/send", async (req, res) => {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const user = await clerkClient.users.getUser(userId);
  const firstName = user.firstName ?? "there";
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
  if (!email) {
    res.status(400).json({ error: "No primary email address found on your account." });
    return;
  }

  try {
    const content = await generateDigest(userId, firstName);
    await sendMonthlyDigest(email, content);

    // Record last sent time
    await db
      .insert(userPreferencesTable)
      .values({ userId, lastDigestSentAt: new Date() })
      .onConflictDoUpdate({
        target: userPreferencesTable.userId,
        set: { lastDigestSentAt: new Date(), updatedAt: new Date() },
      });

    res.json({ success: true, sentTo: email });
  } catch {
    res.status(500).json({ error: "Failed to generate or send digest — please try again." });
  }
});

// POST /user/feedback — submit feedback
router.post("/user/feedback", async (req, res) => {
  const userId = uid(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const VALID_CATEGORIES = ["general", "bug", "feature", "other"];
  const { category, message } = req.body as { category?: string; message?: string };
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    return;
  }

  const user = await clerkClient.users.getUser(userId);
  const userEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? "";
  const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || userEmail;

  await db.insert(feedbackTable).values({
    userId,
    userEmail,
    userName,
    category: category ?? "general",
    message: message.trim(),
    status: "new",
  });

  res.json({ success: true });
});

export default router;
