# CanShop v1.01

CanShop is an Android and command-line research notebook for comparing **craft cannabis flower** listings for legal-age adults in Canada. It is intentionally non-transactional: it does not sell cannabis, place orders, open checkout pages, prescribe products, or make medical or safety claims.

## Automatic Bulk Buddy extraction

The Android app no longer requires the user to type every strain manually. Tap **Fetch Bulk Buddy strains** and CanShop will:

1. Request the targeted craft-cannabis search page.
2. Fall back to the craft category page when necessary.
3. Follow pagination and discover the individual strain links.
4. Open each product page through the restricted native HTTPS bridge.
5. Skip explicitly unavailable or out-of-stock products.
6. Extract only the useful comparison fields.

### Extracted fields

- product title and strain type
- average rating and rating count
- flavour profile
- THC minimum and maximum
- CBD listing
- batch date
- current one-ounce variation price
- current quarter-pound variation price
- calculated price per gram for both package sizes
- availability signal

Exact one-ounce and quarter-pound prices are read from WooCommerce variation data. CanShop does not guess package prices from the broad minimum-to-maximum price range shown near the product title.

## Android release identity

| Field | Value |
|---|---|
| App name | CanShop |
| Package | `ca.canshop.app` |
| Version name | `1.0.1` |
| Version code | `101` |
| Minimum Android | Android 6.0, API 23 |
| Target Android | API 35 |
| Release tag | `v1.0.1` |
| Release title | `CanShop v1.01` |

## Other capabilities

- Legal-age confirmation screen
- Persistent on-device comparison notebook and preferences
- Ranking by one-ounce or quarter-pound value
- Preference matching for flavour words and target THC
- Automatic exclusion of kief, hash, pre-rolls, edibles, vapes, extracts, concentrates, CBD candy, shake, and trim
- Manual entry retained as a fallback
- TypeScript CLI retained and validated
- GitHub Actions validation, APK compilation, SHA-256 generation, artifact upload, and release publication

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

The automated GitHub build renames it to `CanShop-v1.01.apk` and publishes it with a SHA-256 checksum.

## CLI usage

```bash
npm install
npm run build
node dist/index.js
```

Offline HTML parsing:

```bash
node dist/index.js --html-file ./craft-flowers.html
```

## Data, security, and privacy

Manual entries, fetched results, and preferences stay in Android WebView local storage. CanShop has no account system, analytics SDK, advertising SDK, location permission, payment handling, or server database.

The native fetch bridge accepts only HTTPS URLs on `bulkbuddy.co` and only the configured craft search/category endpoints or `/product/` pages. Requests have timeout and response-size limits. Storefront navigation and checkout remain blocked.

## Important limits

Public storefront layouts and WooCommerce variation payloads can change. A refresh can fail or return incomplete fields when the source blocks requests, changes its HTML, or omits variation information. CanShop shows missing fields as `Not found` instead of inventing data. Verify prices, freshness, legality, lab information, availability, and local rules independently.

## Documentation

- [Start-to-finish setup tutorial](docs/SETUP_TUTORIAL.md)
- [Final v1.00 audit](docs/FINAL_AUDIT_v1.00.md)
- [v1.01 release notes](docs/RELEASE_NOTES_v1.01.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
