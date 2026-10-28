# Security configuration

Set `ALLOWED_ORIGIN` to the exact public application origin, without a trailing
slash. Gmail callback URLs use this configured origin instead of request headers.
OAuth return URLs must belong to this origin. Replit development may instead set
`REPLIT_DEV_DOMAIN` to its exact hostname.

Admin provisioning at `/api/admin/become` is disabled by default. To provision an
administrator, put their verified Clerk user ID in `ADMIN_BOOTSTRAP_USER_IDS`
(comma-separated). Remove the ID after provisioning. Existing Clerk admin roles
remain valid; audit existing roles when deploying this change.

Email credentials use AES-256-GCM with random nonces and authentication bound to
the owning user's ID. Generate `EMAIL_CREDENTIAL_ENCRYPTION_KEY` with
`openssl rand -hex 32`, keep it in your deployment secret store, and back it up
separately from the database. Do not commit it. Changing or losing this key makes
stored credentials unreadable and requires users to reconnect.

Before deploying over an existing database, schedule email reconnection and clear
legacy credentials in a database transaction:

```sql
BEGIN;
UPDATE email_connections
SET imap_password = NULL, gmail_access_token = NULL,
    gmail_refresh_token = NULL, gmail_token_expiry = NULL,
    verified = FALSE, updated_at = NOW();
COMMIT;
```

This operation disconnects all email accounts. Run it once during the transition,
before users reconnect. The application rejects legacy plaintext credentials.
Previously created database backups may still contain plaintext credentials;
handle them as secrets and rotate provider credentials as appropriate.

Run credential tests with Node 22.18+ or Node 24:

```sh
node --experimental-strip-types --test artifacts/api-server/tests/credentialEncryption.test.ts
pnpm typecheck
```

These changes are an initial hardening pass. IMAP destination restrictions,
comprehensive request validation, durable OAuth state for multiple API instances,
and broader authorization tests still require review.
