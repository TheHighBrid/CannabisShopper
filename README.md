# CanShop v1.02

CanShop is an Android and command-line research notebook for comparing **craft cannabis flower** listings for legal-age adults in Canada. It is intentionally non-transactional: it does not sell cannabis, place orders, open checkout pages, prescribe products, or make medical or safety claims.

## Complete Bulk Buddy extraction

Tap **Fetch Bulk Buddy strains** and CanShop will:

1. Try the supplied craft-cannabis search endpoint.
2. Scan the craft category in list view.
3. Scan the broader cannabis, AAAA, indica, hybrid, and sativa inventory pages.
4. Follow pagination and include craft products surfaced on the homepage.
5. Deduplicate the discovered product links.
6. Open every candidate product page through the restricted native HTTPS bridge.
7. Accept only pages confirmed as craft flower.
8. Skip only products explicitly marked out of stock, sold out, or unavailable.
9. Extract the useful comparison fields.

The multi-source approach is necessary because Bulk Buddy can block the search endpoint with HTTP 403 or return a cached, partially filtered craft-category page.

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
- explicit availability signal

Exact one-ounce and quarter-pound prices are read from WooCommerce variation data. CanShop does not guess package prices from the broad minimum-to-maximum price range shown near the product title.

## Android release identity

| Field | Value |
|---|---|
| App name | CanShop |
| Package | `ca.canshop.app` |
| Version name | `1.0.2` |
| Version code | `102` |
| Minimum Android | Android 6.0, API 23 |
| Target Android | API 35 |
| Release tag | `v1.0.2` |
| Release title | `CanShop v1.02` |

## Reliability improvements

- Up to three attempts per page with short retry backoff
- Native HTTP session-cookie persistence
- Browser-like request headers and referer
- Detailed counts for discovered links, accepted strains, sold-out pages, non-craft pages, failed product pages, and failed inventory sources
- 8 MB response safety limit for large list-view pages
- Missing fields displayed as `Not found` rather than guessed

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

The automated GitHub build renames it to `CanShop-v1.02.apk` and publishes it with a SHA-256 checksum.

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

The native fetch bridge accepts only HTTPS URLs on `bulkbuddy.co`, limited to product pages, the homepage/search path, and cannabis inventory categories. Requests have timeout and response-size limits. Storefront navigation and checkout remain blocked.

## Important limits

Public storefront layouts, product tagging, caching, and WooCommerce variation payloads can change. A refresh can fail or return incomplete fields when the source blocks requests, changes its HTML, or omits variation information. CanShop reports failures and shows missing fields as `Not found` instead of inventing data. Verify prices, freshness, legality, lab information, availability, and local rules independently.

## Documentation

- [Start-to-finish setup tutorial](docs/SETUP_TUTORIAL.md)
- [Final v1.00 audit](docs/FINAL_AUDIT_v1.00.md)
- [v1.01 release notes](docs/RELEASE_NOTES_v1.01.md)
- [v1.02 release notes](docs/RELEASE_NOTES_v1.02.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
