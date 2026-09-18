# CanShop v2.05

CanShop v2.05 fixes the remaining fetch blocker where one craft strain with a currently listed selected package could stop the entire refresh because its exact package price could not be extracted.

## What changed

- Separates selected-package availability from selected-package price extraction.
- A currently listed craft strain is no longer rejected solely because the exact 1 Ounce or Quarter Pound price could not be parsed.
- Detects the selected package directly from WooCommerce weight controls and product attribute rows when the variation endpoint is unavailable or stale.
- Keeps the product in the eligible shortlist when the selected package is confirmed present, even if price remains unverified.
- Missing price is shown as unverified and receives the existing deterministic low-confidence value score instead of crashing the whole fetch.
- Products whose selected package is explicitly absent remain excluded.
- Products whose selected-package availability is genuinely unknown still fail closed rather than being silently omitted.

## Regression target

The reported live craft listing showed eight products while CanShop v2.04 stopped with "1 selected-package record could not be verified." v2.05 removes price extraction as a hard blocker so a single stale price record cannot zero the entire result set.
