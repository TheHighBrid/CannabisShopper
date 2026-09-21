# CanShop v2.08

CanShop v2.08 fixes two regressions reported against v2.07: Bulk Buddy could retain products whose selected 1 Ounce package price was not actually verified, and the new Canna Cabana source could time out in the UI before the native Android request finished retrying.

## Bulk Buddy selected-package integrity

- The exact craft search listing is now the first discovery source.
- CanShop reads the live listing price range before opening a product page.
- For the 1 Ounce shortlist, a listing whose maximum advertised price is below CAD $90 is rejected before product-page verification.
- Four-digit listing prices such as $1,175.00 are parsed correctly.
- A product is no longer eligible merely because a 1 Ounce option appears present.
- The selected package must have both verified availability and an exact verified price.
- Products with an unverified selected-package price are excluded from the final shortlist instead of appearing as valid ranked results with "Could not verify".
- A selected-package verification miss no longer aborts the entire successful crawl. It is counted and reported as an exclusion.
- Hard product-page/network failures still fail closed.

## Canna Cabana timeout

The Canna Cabana API itself was verified responding in well under the UI timeout, but v2.07 allowed the Android native bridge to retry for longer than the JavaScript request could remain open. The UI could therefore report "request timed out" before native networking had finished.

v2.08:
- limits Canna Cabana native requests to two bounded attempts;
- uses 10-second connect and 15-second read timeouts;
- keeps the total native retry window below the JavaScript request timeout;
- uses API-specific browser headers, Origin and Referer;
- disables connection reuse for the Canna request;
- keeps the locked query: Whole Flower, 28 G, THC 29.97%–34.97%, store 3658, Elite price only.

## Live verification performed during development

A live probe on September 20/21, 2026 confirmed:
- the Canna Cabana inventory endpoint responded in roughly 0.6–1.3 seconds;
- the locked API returned current 28 g inventory for store 3658;
- four products currently passed the 28 g + THC + Elite-price + positive-stock contract at probe time.

Retail inventory is live and can change after release, so product counts are intentionally not hardcoded.
