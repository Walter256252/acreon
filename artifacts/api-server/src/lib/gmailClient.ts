import { ReplitConnectors } from "@replit/connectors-sdk";

export const GMAIL_CONNECTED = true;

/**
 * Returns a fresh ReplitConnectors instance. Never cache — tokens expire.
 */
export function getGmailConnectors() {
  return new ReplitConnectors();
}

/**
 * Proxy helper — wraps connectors.proxy and parses JSON.
 */
export async function gmailGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const connectors = getGmailConnectors();
  const url = params
    ? `${path}?${new URLSearchParams(params).toString()}`
    : path;
  const response = await connectors.proxy("google-mail", url, { method: "GET" });
  return response.json() as Promise<T>;
}
