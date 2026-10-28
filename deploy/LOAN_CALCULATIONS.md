# Deploying the loan calculation corrections

For personal account setup, architecture, calculation formulas, examples, and
configuration details, see the [main README](../README.md). This document focuses
on the database migration and deployment.

The updated API requires the `current_loan_balance_as_of` column. Apply
[migrations/001_loan_balance_as_of.sql](migrations/001_loan_balance_as_of.sql)
**before** deploying the new API image. No application container runs this
migration automatically.

For the Portainer stack:

1. Back up the Acreon PostgreSQL database and pause application writes during the migration.
2. Open the `acreon-db` container's Console in Portainer and connect using:

   ```sh
   psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
   ```

3. Paste the complete contents of the migration SQL file into `psql`. Confirm
   `COMMIT` succeeds, then enter `\q` to exit. The migration can safely be rerun.
4. Rebuild/redeploy the API and frontend from the updated repository.
5. Check a property with a known balance, a saved extra payment, and its portfolio
   projection against your lender's statement.

Existing manually supplied balances have no reliable historical timestamp. The
migration marks them as current at migration time. Correct stale balances after
upgrading; do not assume an old entered balance is today's lender balance.

## Calculation conventions

- Fixed-rate monthly estimates, with interest and ledger balances rounded to cents.
- The loan date is the **first payment month**, rather than the closing date.
- Current estimated balances include scheduled payments before the current UTC
  month. They do not assume this month's payment has already occurred. A logged
  payment supplies its post-payment balance and resumes estimates next month.
- Manually supplied balances are timestamped separately from other property edits.
  Newer recorded payments take precedence; older records do not overwrite a newer
  manual balance. Without either, the original loan and actual monthly payment
  determine the estimated balance.
- New payment-plan changes preserve the balance reached before the edit and apply
  going forward; they do not recalculate past payments with the new settings.
- One-time extras are stored by original loan month, then translated to the
  displayed schedule's payment numbers. They do not replay as a snapshot ages.
- A schedule ending with debt has no payoff date. Later projections retain that
  debt instead of inventing payoff. Interest after maturity requires updated loan
  terms; it is not modeled automatically.
- Underpayments retain the entered payment and add unpaid interest to debt.
  Negative principal identifies this capitalization. Actual lender rules may differ.
- Interest/principal totals begin at the schedule's starting balance; historical
  interest before a manual or recorded snapshot is not reconstructed.
- Scenario savings compare plans from the same starting point. They are unavailable
  if either plan still has debt at term end. Property scenarios compare against
  the saved property plan; the standalone calculator compares against no extras.

## Validation

With Node 22.18+ and pnpm:

```sh
pnpm --filter @workspace/api-server test
pnpm typecheck
pnpm build
```

The loan tests run without a database or provider secrets. Existing unrelated
repository type errors may still prevent the full typecheck/build scripts from
completing.
