# CanShop v2.01

CanShop v2.01 is a reliability release focused on making Bulk Buddy craft inventory results deterministic and package-aware across Android devices.

## Fixed

- Preserves Bulk Buddy inventory pagination and `per_page` parameters instead of silently stripping them in the Android network bridge.
- Removes unique cache-busting query strings that could make simultaneous devices hit different uncached storefront responses.
- Retries failed inventory and product requests with exponential backoff.
- Rejects incomplete scans instead of replacing a good catalog with a partial fetch.
- Requires the selected shopping package to be explicitly available and priced before a strain enters the shortlist.
- Adds WooCommerce variation verification for product pages whose package prices are loaded through `wc-ajax=get_variation`.
- Distinguishes package unavailable from package data that could not be verified.
- Expands package matching for 1 ounce and quarter-pound aliases, including ounce, oz, gram, quarter-pound, 4 oz, and 112/113 g labels.
- Replaces cohort-relative value scoring with a deterministic score so identical product data and preferences produce identical scores on different devices.
- Removes the legacy hidden default THC, price, flavour, and availability filters. The default ranking package is now 1 Ounce.
- Fixes history snapshots treating `null` package prices as `$0.00`.
- Saves history only after a complete verified fetch, preventing failed retrievals from looking like stock-outs or restock events.
- Tracks history using the package that was actually ranked.

## Data integrity behavior

If any required inventory page, product page, selected-package availability, or selected-package price cannot be verified after retries, CanShop now keeps the previous valid results and reports the fetch as incomplete. It does not save the failed run into trend history.
