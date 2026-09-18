# CanShop v2.04

CanShop v2.04 fixes the remaining 6-of-8 craft shortlist bug by changing which Bulk Buddy surface is authoritative for current inventory.

## Root cause

Bulk Buddy can show a strain as currently active on the craft/category listing while its individual product page still serves an older generic "out of stock" state. v2.03 tried to refresh the product-detail page more aggressively, but the crawler still allowed that stale generic product-page flag to veto the fresher listing.

That is why Pink Pussy and Purple Dank Breath could remain missing even though the current listing showed both products active.

## Fixed

- Treats current category/listing evidence as the authority for whether a craft product is presently listed for purchase.
- Carries listing availability evidence alongside each discovered product URL instead of discarding it after discovery.
- Prevents a stale generic product-detail "sold out" marker from overriding a fresher active listing.
- Still verifies the selected package and price before a strain can enter the shortlist.
- Adds a WooCommerce variation fallback for stale product pages whose normal variation form is missing.
- Extracts the main WordPress product id from the page itself and queries the variation endpoint for the selected package.
- Keeps fallback verification fail-closed. Guessed variation payloads that return false are not treated as proof that a package is unavailable.
- Keeps genuinely sold-out products and products without the selected package excluded.
- Preserves deterministic scoring and canonical source URLs.

## Regression target

For the reported live state where Bulk Buddy shows eight current craft products and the selected package is 1 Ounce, CanShop must not silently return six because Pink Pussy and Purple Dank Breath have stale product-detail stock markers. If package verification for either product cannot be completed, the fetch must be reported as incomplete rather than silently dropping the strain.
