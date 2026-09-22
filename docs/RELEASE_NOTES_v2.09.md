# CanShop v2.09

CanShop v2.09 replaces the Canna Cabana Android transport used in v2.07/v2.08.

## Root cause

v2.08 added HttpURLConnection connect/read timeouts, but those are not a hard deadline for the complete native request. A request can still spend time outside those socket phases before the JavaScript side receives a response. On affected Android devices this left the Canna Cabana card stuck on "Fetching ... page 1 of 1" until the UI timer eventually expired.

## Fix

- Canna Cabana now uses OkHttp instead of HttpURLConnection.
- Each native attempt has a 12-second absolute call timeout covering the entire request lifecycle.
- Connect timeout: 6 seconds.
- Read timeout: 10 seconds.
- At most two attempts are made, with the existing short retry delay.
- The JavaScript safety window is 35 seconds, longer than the maximum native retry window.
- When the JavaScript deadline is reached, it actively cancels the matching native OkHttp call so no ghost request continues in the background.
- Redirects are followed by OkHttp, then the final URL is revalidated against CanShop's locked Canna Cabana endpoint/filter contract.
- The response still has to contain the expected data and pagination structure before it is accepted.

## Filters unchanged

The Canna Cabana source remains locked to:
- Whole Flower
- 28 G
- THC 29.97% to 34.97%
- store 3658
- Elite price only
- positive stock only

Market and standard member prices are still ignored.
