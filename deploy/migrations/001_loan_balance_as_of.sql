-- Run before deploying the updated API. Existing known balances are treated as
-- current at migration time; verify older snapshots against lender statements.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_loan_balance_as_of timestamp;
-- Legacy known-balance schedules numbered extras from their snapshot month.
UPDATE properties p SET saved_extra_payments = (
  SELECT jsonb_agg(jsonb_build_object('paymentNumber',
    (entry->>'paymentNumber')::integer + GREATEST(0,
      (EXTRACT(YEAR FROM CURRENT_DATE)::integer - substring(p.loan_start_date, 1, 4)::integer) * 12
      + EXTRACT(MONTH FROM CURRENT_DATE)::integer - substring(p.loan_start_date, 6, 2)::integer),
    'amount', entry->'amount'))
  FROM jsonb_array_elements(p.saved_extra_payments) entry
)
WHERE current_loan_balance IS NOT NULL AND current_loan_balance_as_of IS NULL
  AND saved_extra_payments IS NOT NULL;
UPDATE properties SET current_loan_balance_as_of = CURRENT_TIMESTAMP
WHERE current_loan_balance IS NOT NULL AND current_loan_balance_as_of IS NULL;
COMMIT;
