# CanShop v2.03

CanShop v2.03 fixes stale product-page stock responses that could make recently restocked craft strains disappear from the verified shortlist.

## Fixed

- Adds a controlled freshness token to Bulk Buddy product-detail requests so retries do not keep receiving the same stale cached product page.
- Keeps stored product/source URLs canonical by stripping the temporary freshness token before saving or ranking.
- Uses a normal browser user agent and stronger no-cache/no-store request headers for product retrieval.
- Allows only a numeric `_canshop` freshness token on Bulk Buddy product URLs inside the Android network allow-list.
- Lets verified package-specific WooCommerce variation availability override a generic stale product-level out-of-stock marker.
- Preserves fail-closed behavior when package availability or price still cannot be verified.

## Regression reproduced

The craft listing contained 9 candidate pages. CanShop v2.02 returned 6, excluding Pink Pussy and Purple Dank Breath as sold out even though the listing showed them active. One other product, Pink Wagyu, legitimately lacked the selected 1 Ounce package. The expected verified shortlist is therefore 8.
