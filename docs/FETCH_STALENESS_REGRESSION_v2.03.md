# CanShop v2.03 fetch-staleness regression

Observed September 13, 2026:

- Bulk Buddy craft listing showed 9 candidate craft products.
- 8 should qualify for the 1 Ounce shortlist.
- Pink Wagyu should be excluded because the selected 1 Ounce package is unavailable.
- Pink Pussy and Purple Dank Breath were visibly active on the listing but CanShop v2.02 classified them as sold out.
- Result: 6 instead of 8.

Root failure mode addressed in v2.03:

1. A product listing can be fresher than a cached product-detail response after a restock.
2. v2.02 requested the same canonical product URL repeatedly, so retries could receive the same stale cached object.
3. The Android fetch layer therefore needed a way to force fresh product-detail retrieval without contaminating the canonical source URL stored by the app.

Regression expectations:

- Product detail GETs use a short-lived internal `_canshop` freshness token while stored/source URLs remain canonical.
- A new token is generated for each retry and for validated product-page redirects.
- Requests use a browser-normal user agent plus `no-store` and revalidation directives.
- The freshness token is created only after the URL has passed CanShop's existing HTTPS, host, and path validation.
- A genuinely sold-out product remains excluded.
- An unavailable 1 Ounce variation remains excluded even when the product itself has other sizes in stock.
- In the 9-candidate scenario above, Pink Pussy and Purple Dank Breath must not be dropped merely because an older product-page cache says sold out.
