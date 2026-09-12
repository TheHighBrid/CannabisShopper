# CanShop v2.02

CanShop v2.02 fixes the page-one canonical redirect regression exposed by the stricter v2.01 fail-closed inventory crawler.

## Fixed

- Normalizes Bulk Buddy category aliases ending in `/page/1/` back to their canonical category root before fetching.
- Drops redundant `paged=1` and `product-page=1` query aliases while preserving real page 2+ pagination.
- Safely follows up to five HTTP redirects for Bulk Buddy page requests instead of treating every canonical redirect as a retrieval failure.
- Revalidates every redirect target against CanShop's existing HTTPS, Bulk Buddy host, and cannabis/product path allow-list before following it.
- Keeps automatic redirects disabled at the HTTP client level so no unvalidated redirect target can be followed implicitly.

## Why this matters

Bulk Buddy/WooCommerce can emit links such as `/product-category/cannabis/page/1/` and `/product-category/cannabis/indica/page/1/`. Page 1 is normally canonicalized back to the category root. In v2.01, those harmless redirects were interpreted as hard inventory-source failures, causing CanShop to correctly refuse to save a partial report but preventing a valid scan from completing.

v2.02 preserves the v2.01 data-integrity rules while handling these canonical redirects correctly.
