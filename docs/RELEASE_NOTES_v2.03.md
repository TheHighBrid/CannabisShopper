# CanShop v2.03

CanShop v2.03 fixes stale product-page stock responses that could make recently restocked craft strains disappear from the verified shortlist.

## Fixed

- Adds a short-lived freshness token internally to Bulk Buddy product-detail GETs so retries do not keep receiving the same stale cached product page.
- Generates a new freshness token on each network attempt and after validated product-page redirects.
- Keeps the URL returned to the web app canonical, so temporary cache-busting parameters never enter saved products, ranking keys, or trend history.
- Uses a normal browser user agent instead of a custom cache-varying suffix.
- Strengthens request revalidation with `no-cache`, `no-store`, `must-revalidate`, `Expires: 0`, and an epoch `If-Modified-Since` header.
- Preserves the existing HTTPS, Bulk Buddy host, redirect, cannabis-path, package-availability, and fail-closed protections.

## Regression reproduced

The craft listing contained 9 candidate pages. CanShop v2.02 returned 6, excluding Pink Pussy and Purple Dank Breath as sold out even though the current listing showed them active. One other product, Pink Wagyu, legitimately lacked the selected 1 Ounce package. The expected verified shortlist is therefore 8 when the current product pages confirm those two restocked strains.
