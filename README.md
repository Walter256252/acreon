# Acreon

Acreon tracks a real estate portfolio: properties, mortgage balances, equity,
occupancy, income and expenses, property communications, and loan scenarios.
The application has a React frontend, an Express API, and a PostgreSQL database.

This README explains personal account setup, the code structure, and the loan
calculation changes. The deployment-specific migration procedure is in
[deploy/LOAN_CALCULATIONS.md](deploy/LOAN_CALCULATIONS.md). Email encryption and
admin provisioning are covered in [SECURITY.md](SECURITY.md).

## Using `hallxtheiss@gmail.com` as your personal account

Your personal email is an **application login**, not a server configuration value.
You do not need to put it in `deploy/.env`, `.env.example`, or the encryption key.

### If you are creating a new account

1. Open your deployed Acreon website.
2. Choose **Sign up** and use `hallxtheiss@gmail.com`, or choose that Google account
   if Google sign-in is enabled for your authentication instance.
3. Complete email verification and onboarding when prompted.
4. Sign in with that account when managing your personal portfolio.

Clerk assigns the account a user ID beginning with `user_`. Acreon associates
properties and other records with that ID, rather than matching email strings.
A new account has a different user ID and does not automatically inherit records
from an older account.

### If you want to keep an existing account's portfolio

Update and verify the email address on the **existing Clerk account**, then make
`hallxtheiss@gmail.com` its primary address using the account-management tools for
your authentication instance. Preserve the existing user ID. Creating another
account is not a transfer of the old account's properties.

The exact account-management screen depends on whether your authentication
instance is managed directly in Clerk or through the original Replit setup.
Use the instance corresponding to the keys deployed in Portainer.

### If this personal account should also be an administrator

A normal personal account does not need an environment variable. Admin access is
an additional role and must be configured explicitly:

1. Find the Clerk user record for `hallxtheiss@gmail.com` in the authentication
   instance used by the deployed app. Copy its actual `user_...` ID.
2. In the Acreon stack's Portainer environment variables, set:

   ```dotenv
   ADMIN_BOOTSTRAP_USER_IDS=user_replace_with_the_actual_id
   ```

3. Redeploy/recreate the API container with that environment value.
4. Sign in to Acreon as this account. If the **Claim admin** control is available,
   use it. The underlying operation is `POST /api/admin/become`.
5. If no control is visible, an authenticated same-origin request can invoke the
   endpoint. In the browser developer console on your Acreon website, while
   signed in to the intended account, run:

   ```js
   fetch('/api/admin/become', {
     method: 'POST',
     credentials: 'same-origin',
   }).then(async response => ({
     status: response.status,
     body: await response.json(),
   })).then(console.log);
   ```

6. Confirm a successful response, then sign out and back in so the role is
   refreshed in the frontend.
7. Remove the ID from `ADMIN_BOOTSTRAP_USER_IDS` and redeploy the API again. The
   Clerk admin role remains assigned; the provisioning endpoint is disabled when
   the allowlist is empty.

Do not enter the email address as the allowlist value. The API compares the
signed-in **user ID** with the configured IDs. Adding an ID permits provisioning;
it does not itself assign the role. Admin access exposes platform-level tools,
so keep it separate from an ordinary personal account if you want those roles
separated.

### If you also want to connect this Gmail inbox

Signing in with Google does not grant Acreon access to read Gmail. Mailbox access
is a separate connection through Acreon's email connection settings. Select
`hallxtheiss@gmail.com` when completing that Google authorization flow.

The server needs Google OAuth client credentials and the email encryption key.
Acreon's Gmail callback is:

```text
https://YOUR-ACREON-HOST/api/email/gmail/callback
```

The host comes from `ALLOWED_ORIGIN`. Register the matching callback with your
Google OAuth client. See [SECURITY.md](SECURITY.md) before reconnecting accounts
that were stored by an older version.

Monthly digest sending uses the Clerk account's **primary email address**. This
is independent of which mailbox you connect for property email synchronization.

## How the application is organized

| Location | Responsibility |
| --- | --- |
| `artifacts/realestate-tracker/src` | React pages, forms, charts, routing, and authentication UI |
| `artifacts/api-server/src/app.ts` | Express middleware, Clerk authentication setup, rate limits, errors |
| `artifacts/api-server/src/routes` | HTTP handlers for properties, payments, projections, finances, email, and admin |
| `artifacts/api-server/src/lib/loan.ts` | Pure loan calculations and snapshot rules; no database or AI calls |
| `artifacts/api-server/src/lib/propertyLoan.ts` | Loads a property's latest eligible payment and calls the loan engine |
| `lib/db/src/schema` | Drizzle PostgreSQL table definitions |
| `lib/api-spec/openapi.yaml` | API contract used for code generation |
| `lib/api-client-react/src/generated` | Generated frontend request functions, hooks, and types |
| `lib/api-zod/src/generated` | Generated API validation schemas and types |
| `deploy` | Docker builds, Compose services, Nginx, and migration instructions |

The workspace uses pnpm. Changes to the API contract should be made in the
OpenAPI file and followed by code generation; generated files should not become
a separate source of truth.

## Request flow

```text
Browser
  -> public server / reverse proxy
  -> acreon-web (Nginx)
       /              -> React application
       /assets/*      -> compiled frontend assets
       /api/*         -> acreon-api (Express)
                           -> Clerk authentication
                           -> route handler
                           -> Drizzle / PostgreSQL
                           -> shared loan calculation, when needed
```

`/api/__clerk` is the application-hosted Clerk proxy path. It is distinct from
Google's Gmail OAuth callback. Most application API routes require a signed-in
Clerk user. User-facing data access must also enforce ownership; authentication
alone does not establish ownership of a property.

## How the loan calculations work

### 1. Choose the balance source

`getPropertyLoan()` loads the most recent logged payment whose payment date is
not in the future, ordered by payment date and then record ID.
`propertyLoanSnapshot()` then chooses the starting point:

| Situation | Starting point |
| --- | --- |
| No manual balance and no logged payment | Original loan amount and first payment month |
| Manual balance available | Entered balance and its dedicated `currentLoanBalanceAsOf` timestamp |
| Eligible newer logged payment | Logged post-payment remaining balance; estimates resume the next month |

A payment supersedes a manual balance only when its payment date is on or after
the manual snapshot's date **and** its record was created after that snapshot.
An old payment entered late should not replace a newer manual balance.

Changing a property's name, value, or notes does not reset the balance timestamp.
Explicitly supplying a balance on a property create/update records a new timestamp.

### 2. Establish the timeline

`loanStartDate` means the **first payment month**. The day is validated as a real
date, but schedules operate monthly and emit dates on the first of each month.

Date helpers use UTC month numbers:

```text
month index = year × 12 + month - 1
```

This avoids a date such as November 1 becoming October 31 when interpreted in a
western local timezone. Balances described as current include estimated payments
**before** the current UTC month, not an assumed payment for the current month.
A payment logged for the current month can provide the actual post-payment balance.

A manually entered balance ages from its snapshot month. It is not amortized
again from the original loan's start date. The engine also reduces the remaining
term by elapsed months and does not schedule payments before the first payment
month.

### 3. Calculate each monthly row

`buildAmortizationSchedule()` calculates:

```text
monthly interest = round to cents(balance × annual percentage rate / 1200)
requested payment = regular payment + recurring extra + this month's one-time extras
actual payment = minimum(requested payment, balance + monthly interest)
principal = actual payment - monthly interest
new balance = round to cents(balance - principal)
```

For example, a $100,000 balance at 6% with a $1,000 payment starts with:

| Item | Amount |
| --- | ---: |
| Interest | $500.00 |
| Payment | $1,000.00 |
| Principal reduction | $500.00 |
| Remaining balance | $99,500.00 |

The final payment is capped at the amount needed to clear the loan. Duplicate
one-time entries for the same month are added together. Zero-interest loans are
supported.

If the payment is only $400 in this example, the engine preserves that payment,
records principal of **-$100**, and increases debt to **$100,100**. This is an
explicit unpaid-interest capitalization assumption, rather than silently
increasing the payment to $500.

### 4. Apply extra payments without replaying them

In the database, one-time extras use payment numbers relative to the original
first payment month. The API translates those numbers to the displayed schedule
when a manual or recorded balance moves the starting point forward.

For example, if 120 original payment months have elapsed, original payment 121
becomes payment 1 in the new forward schedule. Once that month passes, the extra
must not be applied again.

Monthly extras are included by the shared engine, including in portfolio
projections. For estimates without a balance snapshot, saved monthly extras are
applied throughout the schedule from the original first payment month.

### 5. Determine payoff and future balances

`payoffDate()` returns a date only when the final row has a zero remaining balance.
Reaching the configured term with money still owed is **not** payoff.

`balanceBeforeMonth()` finds the balance immediately before a target month. If
the generated schedule ends with debt, later milestones retain that debt rather
than changing it to zero. The model does not automatically calculate penalties,
a balloon payment, or post-maturity interest; update the loan terms to model an
extended repayment arrangement.

### 6. Compare scenarios

The standalone calculator compares the entered scenario with a plan using the
same loan and regular payment but no extra payments. Property scenarios compare
against the property's saved schedule from the matching starting point.

Savings are available only when both plans pay off within their terms. The API
includes `savingsAvailable` and `remainingBalance`; an empty calculator
`payoffDate` means no payoff within the generated schedule. Property scenario
comparisons can show negative savings if the proposed plan performs worse than
the saved plan.

### 7. Reuse the result across features

The dashboard, portfolio projections, map calculations, admin totals, property
schedule, AI portfolio context, and monthly digest call the shared property loan
helper. AI receives computed values as context; it does not calculate the
amortization schedule itself.

Important limits:

- These are fixed-rate monthly estimates, not a lender's daily-interest ledger.
- Scheduled estimates assume scheduled payments were made unless a manual or
  recorded balance supplies a different starting point.
- Taxes and insurance belong in expense fields; `monthlyPayment` is loan principal
  and interest. Including escrow in it would overstate principal repayment.
- Historical interest before a manual or payment snapshot is not reconstructed.
- Reconciled payment balances are supplied by the recorded data; the application
  does not independently verify a lender statement.

## Portainer configuration

Keep real values in the Portainer stack's environment variables. `.env.example`
is a template; a local `deploy/.env` is ignored by Git and is not automatically
transferred to your server by pushing the repository.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database name and login; keep the existing values for an existing database unless deliberately changing its credentials |
| `ALLOWED_ORIGIN` | Exact public app origin, such as `https://acreon.example.com`, without a trailing slash |
| `WEB_PORT` | Host port exposed by the web container; Compose defaults to `8080` |
| `BASE_PATH` | Frontend base path; use `/` for the standard root deployment |
| `VITE_CLERK_PROXY_URL` | Use `/api/__clerk` for this container setup |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key compiled into the frontend |
| `CLERK_PUBLISHABLE_KEY` | Matching publishable key for the API |
| `CLERK_SECRET_KEY` | Private key for the same Clerk instance |
| `ADMIN_BOOTSTRAP_USER_IDS` | Optional comma-separated IDs permitted to provision themselves as admins; empty disables provisioning |
| `EMAIL_CREDENTIAL_ENCRYPTION_KEY` | Persistent 64-character hexadecimal key for stored mailbox credentials |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client credentials for Gmail connection |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | API key used by the AI integration |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Provider endpoint used by the OpenAI-compatible integration |
| `LOG_LEVEL` | Logging level; example uses `info` |
| `REPLIT_DEV_DOMAIN` | Leave blank for the standard non-Replit container deployment |

`VITE_*` values are build arguments in this Compose configuration. Rebuild the
frontend image after changing them; restarting an existing image does not
recompile them. Runtime API environment changes require recreating the API
container with the updated settings.

Generate the email encryption key locally with:

```sh
openssl rand -hex 32
```

Store the output as `EMAIL_CREDENTIAL_ENCRYPTION_KEY` in Portainer, retain a secure
backup, and reuse it across deployments. It is not your Gmail password and is not
specific to one email address. Changing it makes existing encrypted connections
unreadable. Never put this key in a `VITE_*` variable or commit it.

Before deploying the loan changes, follow the database migration steps in
[deploy/LOAN_CALCULATIONS.md](deploy/LOAN_CALCULATIONS.md). Schema files describe
the desired database structure; changing TypeScript alone does not alter an
existing PostgreSQL database.

## Development and validation

Use Node 22.18+ (Node 24 is also suitable) and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server test
pnpm typecheck
pnpm build
```

The focused tests exercise the pure loan engine and credential encryption without
requiring a database or provider secrets. Coverage includes balance snapshot
aging, logged payments, future loans, zero interest, underpayments, extras,
rounding, term-end debt, and payoff/savings reporting.

To regenerate clients and validation schemas after changing the OpenAPI file:

```sh
pnpm --filter @workspace/api-spec run codegen
```

The API needs `DATABASE_URL`, `PORT`, and the relevant authentication/provider
configuration at runtime. The usual API development command is:

```sh
pnpm --filter @workspace/api-server dev
```

The full typecheck currently has known unrelated errors in the email integration
and some frontend types. The focused tests and individual frontend/API build
commands passed during the loan correction work; this does not mean the complete
root build, which runs typechecking first, is clean.

### Communications email connection tests

```sh
pnpm --filter @workspace/api-server test:email
```

These tests invoke the actual email route handlers with mocked authentication,
database storage, IMAP authentication, and Google responses. They do not open a
browser, contact Google, connect a real mailbox, send email, or verify deployed
Portainer settings. They cover authentication failures, successful encrypted
storage, user isolation, Gmail callback state reuse, and authorization denial.

The callback rejects missing refresh tokens and failed or invalid account identity
lookups before saving a connection. A failed attempt preserves an existing
connection; refresh tokens from a different authorization are never reused.
Regression tests cover these cases. A browser sign-in on the deployed site is
still required to validate the complete Google authorization flow.

The current Communications UI supports one connected mailbox per Acreon user.
When connected, it shows **Disconnect** instead of a second connection form.


### Data integrity and sync behavior

- Transaction updates preserve omitted fields. Explicit `null` clears a nullable
  field; creates and updates validate dates, amounts, transaction types, IDs,
  review flags, rental types, and tax years.
- Occupancy AI batches validate every action and referenced property against the
  signed-in user's property list before executing any writes. Invalid batches
  are rejected rather than partially executing the valid prefix.
- Finance summaries distinguish explicit principal, explicit interest, and
  **Other / Unsplit Loan Payments**. Escrow, PMI, fees, and combined payments
  remain in total debt cash outflow without being presented as principal.
- Sync-all results include `failed` and per-property `error` fields. Successful
  properties still return their synced counts when another property fails.
  The Communications tab displays failed properties even in its new-only view.

Run `pnpm --filter @workspace/api-server test` for calculation, validation, and
ownership checks, and `pnpm --filter @workspace/api-server test:email` for mocked
connection/sync and occupancy route regression tests. No additional database
migration is required for these data integrity corrections. They do not recover
fields cleared by an earlier version or infer principal/interest splits that
were never recorded.


### Forward loan changes and transaction edits

Changing a regular payment, recurring extra, rate, or one-time extra plan first
preserves the balance reached under the previous plan. The new plan starts in
the current payment month (or next month if a payment has already been logged).
An explicitly supplied manual balance remains authoritative. Property scenario
previews now use the same forward starting point and compare rows by calendar
month. One-time extra numbers entered in the property scenario are relative to
that forward schedule, even when the original schedule includes past payments.

Changing a transaction's date updates its derived tax year unless the request
explicitly supplies a tax year. Unchanged dates and review-only updates preserve
existing tax years. Review toggles reject non-success HTTP responses and display
an error instead of reporting a successful save.

These changes require no additional schema migration beyond the existing loan
balance timestamp migration. AI deployment configuration is unchanged.
