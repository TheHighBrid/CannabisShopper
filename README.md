# CanShop v1.00

CanShop is an Android and command-line research notebook for comparing **craft cannabis flower** listings for legal-age adults in Canada. It is intentionally non-transactional: it does not sell cannabis, place orders, open checkout pages, prescribe products, or make medical or safety claims.

## v1.00 highlights

- Native Android shell with an offline-first mobile interface
- Legal-age confirmation screen
- Manual craft-flower entry and persistent on-device comparison notebook
- Public craft-flower category refresh through a native HTTPS bridge
- Automatic exclusion of kief, hash, pre-rolls, edibles, vapes, extracts, concentrates, and CBD candy
- Discount badges ignored in value scoring
- Price-per-gram normalization in Canadian dollars
- Preference matching for terpene and flavour words
- Availability, transparency, cannabinoid-field, and review-quality signals
- Three-ounce variety versus quarter-pound guardrail: a single-strain QP must be at least 15% cheaper per gram, with comparable transparency, before it avoids a ranking penalty
- Clearly labelled fictional sample data for testing
- TypeScript CLI retained and repaired
- GitHub Actions validation, APK compilation, SHA-256 generation, artifact upload, and release publication

## Android release identity

| Field | Value |
|---|---|
| App name | CanShop |
| Package | `ca.canshop.app` |
| Version name | `1.0.0` |
| Version code | `100` |
| Minimum Android | Android 6.0, API 23 |
| Target Android | API 35 |
| Release tag | `v1.0.0` |
| Release title | `CanShop v1.00` |

## Build locally

Requirements: Java 17, Android SDK 35, Build Tools 35.0.0, Gradle 8.7, and Node.js 20+.

```bash
npm install
npm run check
npm run build
gradle clean assembleRelease
```

The APK is written to:

```text
app/build/outputs/apk/release/app-release.apk
```

The automated GitHub build renames it to `CanShop-v1.00.apk` and publishes it with a SHA-256 checksum.

## CLI usage

```bash
npm install
npm run build
```

Offline HTML parsing:

```bash
node dist/index.js --html-file ./craft-flowers.html
```

## Data and privacy

Manual entries and preferences stay in Android WebView local storage. CanShop has no account system, analytics SDK, advertising SDK, location permission, payment handling, or server database. Live refresh sends an HTTPS request only to the configured public craft-flower category.

## Important limits

Public storefront layouts change. A refresh can fail or return incomplete fields when the source HTML changes, blocks automated requests, or omits information. CanShop marks missing data and provides manual entry as the reliable fallback. Verify product freshness, legality, lab information, availability, and local rules independently.

## Documentation

- [Start-to-finish setup tutorial](docs/SETUP_TUTORIAL.md)
- [Final v1.00 audit](docs/FINAL_AUDIT_v1.00.md)
- [Release notes](docs/RELEASE_NOTES_v1.00.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
