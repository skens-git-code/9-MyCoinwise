# Tax rule maintenance

Tax rules are versioned data, not application logic. To add a jurisdiction:

1. Copy an existing rule file and use a canonical `jurisdiction` and `regime`.
2. Verify brackets, deductions, credits, and dates against the official source.
3. Add a `metadata.source`, `metadata.effective_date`, and `metadata.version`.
4. Add the rule file to `backend/scripts/seed-tax-rules.js`.
5. Add boundary and regression tests to `backend/test/taxEngine.test.js`.
6. Run the seed script idempotently during the deployment migration.

The current rules are intentionally simplified calculation aids. They do not
include filing, state tax, AMT, special asset classes, or professional advice.
