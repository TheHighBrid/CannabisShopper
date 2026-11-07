# CanShop v2.10

CanShop v2.10 fixes the ongoing Canna Cabana strain fetching failures and resolves issue #26.

## Root cause

1. **AndroidBridge method shadowing**: The JavaScript interface method `AndroidBridge.fetchCannaCabanaPage` dispatched an asynchronous runnable that called `fetchCannaCabanaPage(requestId, rawUrl)`. Because the inner class and outer class methods shared the exact same name and signature, Java's scoping rules resolved the invocation to `AndroidBridge.this.fetchCannaCabanaPage`, causing an infinite queue recursion on `cannaExecutor`. The actual network fetch was never invoked, and the request hung until the 35-second UI timeout fired.
2. **False rejection of Elite strains**: Canna Cabana's API returned `is_elite: false` on active Elite promotional and flash-sale listings despite positive `elite_price`, store eligibility at store 3658, and active `ELITE` tags. The local filter rejected these valid whole-flower strains.
3. **Transport safety and validation**: Redirects and URLs required hop-by-hop verification, and response streams needed bounded reading to prevent high memory allocation.

## Fix

- **Resolve method shadowing**: Renamed the outer network fetch method to `fetchCannaPage` and explicitly qualified its invocation from the bridge (`MainActivity.this.fetchCannaPage(...)`).
- **Support all active Elite whole flower strains**: Removed the invalid `pricing.is_elite === false` filter check in `cannacabana.js` while strictly preserving the positive `elite_price`, store 3658 presence in `elite_stores`, and 28 G / THC range requirements.
- **Hop-by-hop URL interceptor**: Added an OkHttp application interceptor that validates every request and redirect target against `validateCannaCabanaUrl` before network transmission.
- **Bounded response streaming**: Replaced full-body string buffering with chunked stream consumption (`readResponse(body.byteStream())`) enforcing the 8 MB payload safety ceiling.
- **Immediate cancellation handling**: Added `cancelledCannaRequests` tracking to prevent retries or error dispatching for timed out or canceled requests.
- **Deterministic release signing (`canshop-release.jks`)**: Replaced ephemeral CI debug signing with a dedicated repository release keystore. All future GitHub and local builds now share the exact same cryptographic signature, eliminating "conflicts with existing package" install errors and allowing seamless in-place APK updates without uninstalling.
- **In-app Research Notebook Backup & Restore**: Added comprehensive backup export and restore tools (JSON file download, native Android share sheet, and clipboard copy). Users can export their Bulk Buddy strains, Canna Cabana Elite strains, search preferences, and daily history logs, and restore them instantly at any time.
- **Android Auto Backup**: Enabled `android:allowBackup="true"` so that native Android backup systems can protect application data.
- **Automated test coverage**: Added unit tests for Canna Cabana normalization, URL construction, interceptor enforcement, cancellation bridge, and backup export/restore parsing.

## Installation

- **`CanShop-v2.10.apk`**:
  Signed with persistent repository release keystore (`canshop-release.jks`). Supports in-app Research Notebook Backup & Restore to seamlessly migrate and preserve all historical fetch data, strains, and preferences across versions. All future updates can be installed directly in place.

## Contract preserved

The Canna Cabana integration remains locked to:
- Whole Flower collection
- 28 G package size
- THC 29.97% to 34.97%
- Store 3658
- Elite price only
- Positive quantity available
