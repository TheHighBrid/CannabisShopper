# v2.02 redirect regression checks

The release is considered valid only if CI confirms the Android application compiles and the web assets/type tests remain clean.

Runtime invariants introduced by this fix:

1. `/product-category/cannabis/page/1/` canonicalizes to `/product-category/cannabis/` before the GET.
2. `/product-category/cannabis/indica/page/1/` canonicalizes to `/product-category/cannabis/indica/` before the GET.
3. `paged=1` and `product-page=1` are dropped, while values greater than 1 remain intact.
4. HTTP 301, 302, 303, 307, and 308 page redirects are followed only after the target is passed back through the existing Bulk Buddy URL allow-list.
5. Redirect loops or more than five hops fail closed.
