# CanShop v2.06

CanShop v2.06 fixes the remaining selected-package verification failure on stale Bulk Buddy product pages.

## Root cause

Bulk Buddy can keep the current craft listing active while an individual product page is stale enough to omit its normal WooCommerce variation form. The page may still show the valid weight list in Additional Information, including 1 Ounce, but CanShop v2.05 only checked structured variation controls and table rows. That could leave one selected-package record as "unknown" and abort the full refresh.

## Fixed

- Reads the product-page weight text directly when the normal variation form or structured attribute markup is missing.
- Detects 1 Ounce, Quarter Pound and other supported weight labels from the page's Additional Information text.
- Uses this fallback only as package-presence evidence. It does not fabricate a price.
- Keeps the v2.05 separation between package availability and package price.
- Preserves explicit package absence as an exclusion.
- Preserves deterministic scoring and current-listing inventory authority.

## Regression target

A current craft product whose page contains a weight list such as "3.5 Grams, 7 Grams, 1/2 Ounce, 1 Ounce, Quarter Pound..." must not remain "unknown availability" just because WooCommerce omitted the live variation form from that response.
