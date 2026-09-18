# CanShop v2.07

CanShop v2.07 adds Canna Cabana as a second retailer and introduces a common-field comparison view across Bulk Buddy and Canna Cabana.

## Canna Cabana source

- Uses the exact Whole Flower inventory collection for store 3658.
- Locks the retailer query to 28 G.
- Locks THC to 29.97% through 34.97%.
- Uses Elite pricing only.
- Explicitly ignores Market and regular member prices.
- Requires a positive Elite price and positive store quantity.
- Selects the actual 28 g variant even when the Canna Cabana API returns products with more than one size.
- Keeps the Canna Cabana inventory in a dedicated local section because that retailer does not expose the same batch dates, review counts, ratings, and flavour fields as Bulk Buddy.

## Cross-source comparison

- Adds a third view combining only fields available from both retailers.
- Compares current Bulk Buddy 1 Ounce products with current Canna Cabana Elite 28 G products.
- Shows source, product name, THC, package price, and comparable price per gram.
- Supports sorting by comparable $/g, package price, THC, or name.
- Does not invent ratings, dates, or other fields absent from Canna Cabana.

## Source verification

The Canna Cabana integration follows the retailer's current collection API used by the Whole Flower page:
- collection: whole-flower
- storeId: 3658
- selectedOptions: 28 G
- thc_level_min: 29.97
- thc_level_max: 34.97
- priceType: elite_price

CanShop applies a second local validation layer to require the 28 g variant, THC range, positive Elite price, Elite-store availability, and positive quantity before a Canna Cabana product is shown.
