# CanShop v1.00 final audit

## Initial repository condition

The repository began as a small TypeScript command-line prototype. Its package declared no TypeScript compiler, and its only GitHub Actions workflow ran `npx webpack` without Webpack or a Webpack configuration. There was no Android project, mobile interface, APK pipeline, release automation, privacy documentation, security guidance, changelog, or end-user setup tutorial.

## Resolved release blockers

| Area | Before | v1.00 result |
|---|---|---|
| TypeScript toolchain | Compiler missing from dependencies | TypeScript and Node typings declared; strict checks run in CI |
| CI | Webpack command with no Webpack project | Unified validation and Android build workflow |
| Android app | Missing | Native Java/WebView Android project, API 23 to 35 |
| APK | Missing | Automated signed sideload APK plus SHA-256 file |
| Release | Missing | Automatic `v1.0.0` GitHub release titled `CanShop v1.00` |
| Core UX | Terminal-only Markdown | Mobile dashboard, ranking cards, preferences, manual entry, local persistence |
| Scope control | Broad parser | Craft flower only, explicit non-flower exclusion |
| Discount handling | Discount details highlighted | Discounts ignored in scoring; regular crossed-out price preferred when available |
| Package comparison | No 3 oz versus QP rule | 15% significant-value guardrail with transparency check |
| Legal-age context | Text disclaimer only | First-run legal-age confirmation and repeated research-only language |
| Privacy | Undocumented | No accounts, ads, analytics, payment, location, or server storage |
| Documentation | Minimal README | README, tutorial, audit, release notes, changelog, security policy, MIT license |

## Validation gates

The release workflow must pass all of these steps:

1. `npm install`
2. `npm run check`
3. `npm run build`
4. Java 17 setup
5. Android Platform 35 and Build Tools 35.0.0 installation
6. Gradle 8.7 setup
7. `gradle --no-daemon clean assembleRelease`
8. APK copy and SHA-256 generation
9. GitHub Actions artifact upload
10. GitHub release create or update

## Known limits

- Public storefront HTML can change without notice.
- Live refresh depends on network access and the source accepting the request.
- Listing cards often omit THC, CBD, package size, terpene notes, or review details.
- A price shown in HTML is not proof of freshness, quality, legality, inventory, or final checkout cost.
- The GitHub sideload APK uses Android debug signing configuration. A private production key is required before Play Store publication.

## Release readiness decision

**Ready for a first public GitHub sideload release after the CI workflow completes successfully.** Play Store readiness is intentionally excluded until private production signing, store listing assets, and formal privacy/legal review are completed.
