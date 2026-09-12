# CanShop discovery redirect diagnosis

The v2.01 fail-closed crawler exposed a canonical-pagination edge case on Bulk Buddy. WooCommerce inventory pages can advertise `/page/1/` pagination aliases even though page 1 is canonically the category root. CanShop's Android network bridge deliberately disabled automatic redirects and treated every non-2xx response as a hard retrieval failure. As a result, harmless page-1 canonical redirects could abort an otherwise valid inventory scan.

The v2.02 fix normalizes `/page/1/` category aliases to the category root before fetching and safely follows a small number of validated Bulk Buddy redirects. Every redirect target is revalidated against the existing HTTPS + `bulkbuddy.co` + cannabis/product scope before it is followed.
