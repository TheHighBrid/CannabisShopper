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
3. v2.02 also let a generic product-level `out of stock` marker veto package-specific variation data.

Regression expectations:

- Product detail GETs use a short-lived `_canshop` freshness token while stored/source URLs remain canonical.
- The Android bridge only permits a numeric `_canshop` token on Bulk Buddy product URLs.
- Requests use browser-normal headers plus `no-store` / revalidation directives.
- Package-specific variation availability wins over a generic stale stock marker when a package is verified available.
- A genuinely sold-out product remains excluded.
- An unavailable 1 Ounce variation remains excluded even when the product itself has other sizes in stock.
- In the 9-candidate scenario above, Pink Pussy and Purple Dank Breath must not be dropped merely because an older product-page cache says sold out.
