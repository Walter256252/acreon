/**
 * Gmail client stub — replaced with the real connector snippet after OAuth setup.
 * When GMAIL_CONNECTED is false, all sync endpoints return 503.
 */
export const GMAIL_CONNECTED = false;

export async function getGmailClient(): Promise<never> {
  throw new Error(
    "Gmail not connected. Connect your Gmail account to enable email sync."
  );
}
