# Changelog

All notable changes to the **MyCoinwise** project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-07

### Added
- **Full pre-publish release readiness**: Unified monorepo lifecycle via `start.js` launcher with zero port conflicts and automated process health checks.
- **Repository hygiene standards**: Root `.gitattributes` (LF normalization and binary flags), `.editorconfig`, and strict engine enforcement via `.npmrc`.
- **Security integration harness**: 33 security integration tests verifying injection defense, session revocation, and cross-user data isolation.
- **Accessible modal controls**: Focus trap hook and WCAG 2.2 AA compliant keyboard navigation in core dialogs.
- **PWA compliance**: Standard 192px and 512px icons plus maskable icons with Android safe zones.

### Changed
- **Express 5 query sanitization**: Hardened query parsing against prototype and operator injections across all endpoints.
- **AI Route Optimization**: Switched Gemini chat integration to native HTTP fetch calling Google's REST API, eliminating redundant client SDKs.
- **Performance**: Opacity-only page transitions in `AppLayout` and hardware-accelerated animations preventing layout thrashing.

### Removed
- Dead legacy files: `data-integrity-report.json`, `thermal-soak-report.json`, `SafeText.jsx`, `wdyr.js`, and unreferenced scratch scripts.
- Unused dependencies: Pruned `@google/generative-ai` from backend; removed `@hookform/resolvers`, `react-hook-form`, `zod`, and `@welldone-software/why-did-you-render` from frontend.
- Developer-machine paths: Sanitized all hardcoded machine and artifact directory references.
