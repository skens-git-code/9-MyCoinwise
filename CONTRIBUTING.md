# Contributing to MyCoinwise

Thank you for contributing to **MyCoinwise**! To ensure stability and release readiness across all environments, please adhere to the following development rules and guidelines.

---

## 1. Client Contract Rule (Crucial)

`frontend/src/services/api.js` is the **source of truth** for all request and response contract shapes across MyCoinwise.

When modifying any API route, data payload, or Mongoose model:
1. Update `frontend/src/services/api.js` first.
2. Update the backend route and model to match the exact contract.
3. If an endpoint diverges or requires backward-compatible aliasing, document it explicitly in your pull request.
4. **Never** widen an enum or add schema properties on one side without keeping the other in sync.

---

## 2. Verification & Smoke Testing

Before submitting changes, all suites and verification scripts must pass:

```bash
# 1. Run all automated tests
npm test

# 2. Verify backend syntax and unit tests
npm --prefix backend test

# 3. Verify frontend unit and route tests
npm --prefix frontend test

# 4. Verify production bundle build
npm --prefix frontend run build

# 5. Run end-to-end pipeline verification
node backend/scripts/verify-all-pipelines.js
```

For release candidates and staging deployments, run the smoke verification script:
```bash
node scripts/verify-production-smoke.cjs
```

---

## 3. Security & Architecture Standards

- **Zero Secrets**: Never commit `.env` or credential files. Use `.env.example` as a template for new variables.
- **Ownership Verification**: Every `:id` route parameter must be validated against `req.user.id` or household membership to prevent IDOR vulnerabilities.
- **Sanitization**: All user-supplied inputs must undergo schema validation via `express-validator` and MongoDB query operator sanitization.
- **Logging**: Use `utils/logger` instead of `console.log` in backend services.

---

## 4. Code Hygiene

- Keep diffs small, focused, and reviewable.
- Ensure all commits maintain clean LF line endings (`.gitattributes`).
- Adhere to `.editorconfig` formatting rules (2 spaces, UTF-8, trailing whitespace trimmed).
