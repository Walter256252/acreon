import { encryptCredential } from "../lib/credentialEncryption";
/**
 * Public email routes — no Clerk auth required.
 * Mounted BEFORE requireAuth so Google's OAuth callback can reach this handler.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { emailConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

// ── In-memory OAuth state store ───────────────────────────────────────────
// Maps a short-lived random token → { userId, returnTo }.
// Entries expire after 10 minutes.

interface OAuthState {
  userId: string;
  returnTo: string;
  expires: number;
}

const oauthStates = new Map<string, OAuthState>();

// Prune expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStates) {
    if (val.expires < now) oauthStates.delete(key);
  }
}, 5 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────────

function getCallbackUrl(req: import("express").Request): string {
  const origin = configuredOrigin();
  return `${origin}/api/email/gmail/callback`;
}


function configuredOrigin(): string {
  const origin = process.env.ALLOWED_ORIGIN ?? (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("A valid ALLOWED_ORIGIN is required for Gmail OAuth");
  }
  return url.origin;
}

export function validatedReturnTo(value: string): string | null {
  try {
    const origin = configuredOrigin();
    const url = new URL(value, origin);
    return url.origin === origin && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

// ── Exported state helpers (used by protected email routes) ───────────────

export function createOAuthState(userId: string, returnTo: string): string {
  const token = crypto.randomUUID();
  oauthStates.set(token, { userId, returnTo, expires: Date.now() + 10 * 60 * 1000 });
  return token;
}

export { getCallbackUrl };

// ── GET /email/gmail/callback-url — shows the exact redirect URI for this environment ──
router.get("/email/gmail/callback-url", (req, res) => {
  const url = getCallbackUrl(req);
  res.send(`
    <html><body style="font-family:sans-serif;padding:2rem;max-width:600px">
      <h2>Gmail OAuth Callback URL</h2>
      <p>Add this URL to <strong>Authorized redirect URIs</strong> in your Google Cloud Console OAuth client:</p>
      <code style="display:block;background:#f4f4f4;padding:1rem;border-radius:6px;word-break:break-all;font-size:1rem">${url}</code>
      <p style="margin-top:1.5rem;color:#666">Go to: <a href="https://console.cloud.google.com/apis/credentials" target="_blank">console.cloud.google.com/apis/credentials</a></p>
    </body></html>
  `);
});

// ── GET /email/gmail/callback ─────────────────────────────────────────────

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
  error?: { message: string };
}

router.get("/email/gmail/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  // Helper to redirect with an error param
  const redirectError = (returnTo: string, reason: string) => {
    try {
      const url = new URL(returnTo);
      url.searchParams.set("gmail_error", reason);
      res.redirect(url.toString());
    } catch {
      res.redirect(`/?gmail_error=${encodeURIComponent(reason)}`);
    }
  };

  // Validate state
  const stateData = state ? oauthStates.get(state) : undefined;
  const returnTo = stateData?.returnTo ?? "/";

  if (!stateData || stateData.expires < Date.now()) {
    redirectError(returnTo, "invalid_state");
    return;
  }
  oauthStates.delete(state);

  if (error) {
    redirectError(returnTo, error === "access_denied" ? "access_denied" : "oauth_error");
    return;
  }

  if (!code) {
    redirectError(returnTo, "no_code");
    return;
  }

  // Exchange code for tokens
  let tokenData: TokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: getCallbackUrl(req),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error("Token exchange rejected");
    tokenData = (await tokenRes.json()) as TokenResponse;
  } catch {
    redirectError(returnTo, "token_exchange_failed");
    return;
  }

  if (tokenData.error || typeof tokenData.access_token !== "string" || !tokenData.access_token.trim()) {
    redirectError(returnTo, "token_exchange_failed");
    return;
  }

  // Every successful connection must have durable credentials for this authorization.
  // Never reuse a previous mailbox's refresh token when switching Google accounts.
  if (typeof tokenData.refresh_token !== "string" || !tokenData.refresh_token.trim()) {
    redirectError(returnTo, "missing_refresh_token");
    return;
  }
  if (tokenData.expires_in !== undefined &&
      (typeof tokenData.expires_in !== "number" || !Number.isFinite(tokenData.expires_in) || tokenData.expires_in <= 0)) {
    redirectError(returnTo, "token_exchange_failed");
    return;
  }

  // Get user's email from Google
  let userEmail = "";
  try {
    const userRes = await fetch("https://www.googleapis.com/userinfo/v2/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) throw new Error("Account lookup rejected");
    const userInfo = (await userRes.json()) as GoogleUserInfo;
    if (userInfo.error || typeof userInfo.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userInfo.email.trim())) {
      throw new Error("Missing account email");
    }
    userEmail = userInfo.email.trim();
  } catch {
    redirectError(returnTo, "identity_lookup_failed");
    return;
  }

  const expiry = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000);

  // Upsert the connection
  try {
    await db
      .insert(emailConnectionsTable)
      .values({
        userId: stateData.userId,
        displayEmail: userEmail,
        provider: "gmail",
        imapTls: true,
        gmailAccessToken: encryptCredential(tokenData.access_token, stateData.userId),
        gmailRefreshToken: encryptCredential(tokenData.refresh_token, stateData.userId),
        gmailTokenExpiry: expiry,
        verified: true,
        lastError: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emailConnectionsTable.userId,
        set: {
          displayEmail: userEmail,
          provider: "gmail",
          imapPassword: null,
          gmailAccessToken: encryptCredential(tokenData.access_token, stateData.userId),
          gmailRefreshToken: encryptCredential(tokenData.refresh_token, stateData.userId),
          gmailTokenExpiry: expiry,
          verified: true,
          lastError: null,
          updatedAt: new Date(),
        },
      });
  } catch {
    redirectError(returnTo, "db_error");
    return;
  }

  // Redirect back to the frontend with success signal
  try {
    const url = new URL(returnTo);
    url.searchParams.set("gmail_connected", "1");
    res.redirect(url.toString());
  } catch {
    res.redirect(`/?gmail_connected=1`);
  }
});

export default router;
