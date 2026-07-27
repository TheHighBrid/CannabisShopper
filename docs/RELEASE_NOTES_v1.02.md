# CanShop v1.02

CanShop v1.02 fixes the incomplete Bulk Buddy refresh that could stop after only a few craft strains.

## What caused the incomplete list

Bulk Buddy can block the product-search endpoint with HTTP 403, while the craft category can return a cached or partially filtered result set. The previous crawler relied primarily on those two sources. It also required a visible cart form before treating a product as available, which incorrectly excluded valid product pages when server-rendered purchase controls were missing.

## Discovery fix

CanShop now combines and deduplicates craft links from:

- the supplied craft search endpoint
- the craft-cannabis category in list view
- the full cannabis category
- AAAA, indica, hybrid, and sativa category pages
- pagination discovered from those pages
- the Bulk Buddy homepage

Broader pages are used only for link discovery. A product is accepted only after its individual page confirms a craft title or Craft Cannabis Flowers category and passes the non-flower exclusion rules.

## Availability fix

A product is now skipped only when its individual page explicitly says out of stock, sold out, or unavailable. The absence of a visible cart form no longer causes a false unavailable result.

## Network resilience

- up to three attempts per page
- short retry backoff
- session-cookie persistence for native HTTP requests
- browser-like request headers and referer
- expanded but restricted Bulk Buddy cannabis-page allowlist
- 8 MB response safety limit
- detailed counts for discovered links, accepted strains, sold-out products, non-craft pages, failed product pages, and failed inventory sources

## Install

Download `CanShop-v1.02.apk` and verify it with `CanShop-v1.02.apk.sha256`.

CanShop remains a non-transactional research tool for legal-age adults in Canada. Verify current prices, availability, freshness, legality, lab information, and local rules independently.
