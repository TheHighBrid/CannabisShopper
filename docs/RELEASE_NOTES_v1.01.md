# CanShop v1.01

CanShop v1.01 removes the need to manually type every current strain. One tap now rebuilds the notebook from Bulk Buddy's craft-flower search results and individual product pages.

## Automatic extraction

The app now:

1. Opens the targeted craft-cannabis search page.
2. Falls back to the craft category page if the search endpoint rejects the request.
3. Discovers product links across pagination.
4. Follows each individual strain page.
5. Confirms the page is craft flower rather than another cannabis format.
6. Skips products that are explicitly out of stock or unavailable.
7. Extracts only the requested comparison fields.

## Extracted fields

- full strain title
- indica, sativa, or hybrid type
- average rating
- rating count
- flavour profile
- THC minimum and maximum
- CBD listing
- batch date
- current one-ounce variation price
- current quarter-pound variation price
- calculated price per gram for both sizes
- live availability signal

## Variation prices

CanShop reads WooCommerce variation data from the product page and matches the `1 Ounce` and `Quarter Pound` weight options. It does not infer prices from the broad page price range. Missing variation data is shown as `Not found` rather than guessed.

## Safety and resilience

- HTTPS requests are restricted to `bulkbuddy.co`.
- The native bridge only permits the craft search/category pages and `/product/` pages.
- Responses have timeout and size limits.
- Storefront navigation and checkout remain blocked.
- Hash, kief, pre-rolls, edibles, vapes, extracts, concentrates, shake, and trim are excluded.
- Manual entry remains available only as a fallback.

## Install

Download `CanShop-v1.01.apk` and verify it with `CanShop-v1.01.apk.sha256`.

CanShop remains a non-transactional research tool for legal-age adults in Canada. Verify prices, availability, freshness, legality, lab information, and local rules independently.
