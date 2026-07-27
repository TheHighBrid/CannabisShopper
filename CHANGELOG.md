# Changelog

## [2.0.0] - 2026-07-27

### Added

- Complete CanShop premium green visual system across the Android WebView interface
- New bag-and-leaf launcher artwork, circular launcher treatment, alternate icon, and branded splash screen
- Reusable SVG icon language for navigation, refresh, filters, search, verification, information, close, and add actions
- Responsive bottom navigation and refined legal-age entry experience

### Changed

- Reworked typography, foregrounds, backgrounds, highlights, accents, numbers, rank markers, separators, cards, buttons, inputs, status pills, dialogs, result layouts, and empty states
- Standardized the palette around deep forest, fresh green, lime, clean white, and muted sage tokens
- Updated Android status bar, navigation bar, launch background, and accent styling
- Upgraded Android, native bridge, package, artifact, and release identities to 2.0.0

### Preserved

- Existing multi-source crawler, ranking, local storage, preferences, legal-age checks, security restrictions, and manual-entry fallback

## [1.0.2] - 2026-07-27

### Fixed

- Replaced the search-and-single-category discovery dependency that could return only a few craft strains
- Added multi-source discovery across craft, cannabis, AAAA, indica, hybrid, sativa, homepage, and pagination pages
- Changed availability handling so only explicit out-of-stock, sold-out, or unavailable pages are skipped
- Added retry backoff and persistent native HTTP session cookies
- Added detailed discovery, filtering, sold-out, and failure counts instead of silently dropping product pages

### Changed

- Expanded the restricted native URL allowlist to Bulk Buddy cannabis inventory pages while continuing to block checkout and unrelated hosts
- Increased the response safety limit from 6 MB to 8 MB for large list-view inventory pages
- Upgraded the Android and local-storage versions to 1.0.2 and schema v3

## [1.0.1] - 2026-07-27

### Added

- One-tap crawler for the Bulk Buddy craft search and category pages
- Pagination-aware discovery of individual strain product links
- Product-page extraction for name, strain type, rating, rating count, flavour, THC range, CBD, batch date, availability, one-ounce price, and quarter-pound price
- WooCommerce variation-data parsing for exact package prices
- Package selector for ranking by one-ounce or quarter-pound value
- Fetch progress, skipped-unavailable counts, and partial-failure reporting

### Changed

- Automatic website extraction is now the primary app workflow
- Manual entry is retained only as a fallback
- Ranking cards now show the exact fields represented in the product-page screenshots
- Storage schema upgraded to support separate package prices and potency ranges

### Security

- Native page fetching is restricted to HTTPS Bulk Buddy craft search, category, and product URLs
- Added browser-compatible request headers while retaining timeout and 6 MB response limits

## [1.0.0] - 2026-07-27

### Added

- CanShop Android application with local mobile interface
- Legal-age confirmation
- Native HTTPS catalog bridge
- Manual craft-flower comparison notebook
- Persistent local preferences and products
- Craft-flower-only filtering and non-flower exclusions
- Three-ounce variety versus quarter-pound significant-value rule
- GitHub Actions APK and release pipeline
- SHA-256 release checksum
- Setup, audit, release, privacy, and security documentation

### Changed

- Repaired TypeScript development dependencies and validation scripts
- Replaced invalid Webpack workflow with Android and CLI validation
- Removed discount emphasis from recommendations and ranking

### Security

- Disabled cleartext traffic, cookies, WebView debugging, external navigation, backups, and universal file URL access
- Added response-size and timeout limits to catalog refresh
