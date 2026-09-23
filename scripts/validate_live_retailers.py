#!/usr/bin/env python3
import argparse
import html as html_lib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139 Safari/537.36"
CANNA_API = "https://app.cannacabana.com/api/product/filterv2"
CANNA_REFERER = "https://cannacabana.com/collections/whole-flower?sID=3658"
BULK_URL = "https://www.bulkbuddy.co/?term=craft-cannabis-flowers&s=&post_type=product&taxonomy=product_cat"
BRIDGE_LIMIT = 256 * 1024
RAW_LIMIT = 8 * 1024 * 1024


def fetch(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9", **(headers or {})})
    started = time.monotonic()
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read()
        status = response.status
        final_url = response.geturl()
    return status, final_url, body, time.monotonic() - started


def canna_url():
    params = {
        "selectedOptions": "28 G",
        "collection": "whole-flower",
        "price_min": "0",
        "cbd_level_min": "0",
        "cbd_level_max": "100",
        "thc_level_min": "29.97",
        "thc_level_max": "34.97",
        "storeId": "3658",
        "page": "1",
        "limit": "100",
        "sortOrder": "asc",
        "sortField": "title",
        "priceType": "elite_price",
    }
    return CANNA_API + "?" + urllib.parse.urlencode(params)


def load_canna():
    status, final_url, raw, elapsed = fetch(
        canna_url(),
        {
            "Accept": "application/json",
            "Origin": "https://cannacabana.com",
            "Referer": CANNA_REFERER,
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
        timeout=15,
    )
    if status != 200:
        raise AssertionError(f"Canna Cabana HTTP {status}")
    if not final_url.startswith(CANNA_API):
        raise AssertionError(f"Unexpected Canna final URL: {final_url}")
    if elapsed >= 12:
        raise AssertionError(f"Canna API exceeded 12-second native call budget: {elapsed:.3f}s")
    if len(raw) > RAW_LIMIT:
        raise AssertionError(f"Canna raw payload too large: {len(raw)} bytes")
    payload = json.loads(raw)
    if not isinstance(payload.get("data"), list) or not isinstance(payload.get("pagination"), dict):
        raise AssertionError("Canna payload missing data/pagination")
    return payload, raw, elapsed


def num(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def accepted_canna(payload):
    accepted = []
    for product in payload.get("data") or []:
        for variant in product.get("variants") or []:
            pricing = variant.get("pricing") or {}
            equivalent = num(pricing.get("equivalent_g"))
            title = str(variant.get("title") or "")
            is_28g = (equivalent is not None and abs(equivalent - 28.0) < 0.05) or bool(re.match(r"^28\s*g(?:rams?)?$", title, re.I))
            if not is_28g:
                continue
            thc = num(pricing.get("thc_level"))
            elite = num(pricing.get("elite_price"))
            qty = num(pricing.get("qty_available"))
            stores = [x.strip() for x in str(pricing.get("elite_stores") or "").split(",") if x.strip()]
            if thc is None or not (29.97 <= thc <= 34.97):
                continue
            if elite is None or elite <= 0 or pricing.get("is_elite") is False:
                continue
            if stores and "3658" not in stores:
                continue
            if qty is None or qty <= 0:
                continue
            accepted.append({"title": product.get("title"), "thc": thc, "elite": elite, "qty": qty})
            break
    return accepted


def compact_payload(payload):
    out = {"data": [], "pagination": payload.get("pagination") or {}}
    product_keys = ("id", "title", "handle", "vendor", "tags")
    variant_keys = ("id", "sku", "title")
    pricing_keys = ("equivalent_g", "thc_level", "cbd_level", "elite_price", "qty_available", "is_elite", "elite_stores")
    for product in payload.get("data") or []:
        compact = {k: product[k] for k in product_keys if k in product and product[k] is not None}
        variants = []
        for variant in product.get("variants") or []:
            pricing = variant.get("pricing")
            if not isinstance(pricing, dict):
                continue
            cv = {k: variant[k] for k in variant_keys if k in variant and variant[k] is not None}
            cv["pricing"] = {k: pricing[k] for k in pricing_keys if k in pricing and pricing[k] is not None}
            variants.append(cv)
        compact["variants"] = variants
        out["data"].append(compact)
    return out


def normalize_html_text(fragment):
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", fragment, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    return " ".join(text.split())


def bulk_product_windows(html):
    link_pattern = re.compile(
        r"href=[\"'](?P<url>(?:https?://(?:www\.)?bulkbuddy\.co)?/product/[^\"'#?]+/?)[\"']",
        re.I,
    )
    found = {}
    for match in link_pattern.finditer(html):
        url = match.group("url")
        if url.startswith("/"):
            url = "https://www.bulkbuddy.co" + url
        start = max(0, match.start() - 1800)
        end = min(len(html), match.end() + 2800)
        context = normalize_html_text(html[start:end])
        if "craft" not in context.lower():
            continue
        existing = found.get(url)
        if existing is None or len(context) > len(existing):
            found[url] = context
    return found


def validate_canna():
    payload, raw, elapsed = load_canna()
    accepted = accepted_canna(payload)
    if not accepted:
        raise AssertionError("Locked Canna query returned zero eligible 28 G Elite products")
    print(json.dumps({"status": "PASS", "elapsed_s": round(elapsed, 3), "raw_bytes": len(raw), "eligible": len(accepted), "sample": accepted[:5]}, indent=2))


def validate_bulk():
    status, final_url, raw, elapsed = fetch(BULK_URL, timeout=30)
    if status != 200:
        raise AssertionError(f"Bulk Buddy HTTP {status}")
    parsed_final = urllib.parse.urlparse(final_url)
    if parsed_final.hostname not in {"bulkbuddy.co", "www.bulkbuddy.co"}:
        raise AssertionError(f"Unexpected Bulk Buddy final host: {parsed_final.hostname}")
    if elapsed >= 20:
        raise AssertionError(f"Bulk Buddy search exceeded 20-second validation budget: {elapsed:.3f}s")
    html = raw.decode("utf-8", "ignore")
    windows = bulk_product_windows(html)
    if len(windows) < 4:
        # Fallback to visible search text so a harmless storefront markup refactor does not
        # masquerade as an inventory outage. The app itself has independent DOM parsing tests.
        plain = normalize_html_text(html)
        craft_titles = set(
            " ".join(match.group(0).split())
            for match in re.finditer(r"[A-Za-z0-9][A-Za-z0-9 &'’+()./-]{2,90}(?:AAAA\+|AAAA)[A-Za-z0-9 &'’+()./-]{0,80}Craft", plain, re.I)
        )
        if len(craft_titles) < 4:
            raise AssertionError(
                f"Bulk Buddy live craft contract exposed too little inventory: {len(windows)} product links / {len(craft_titles)} visible craft titles"
            )
        print(json.dumps({"status": "PASS", "elapsed_s": round(elapsed, 3), "craft_titles": len(craft_titles), "mode": "visible-title-fallback", "final_url": final_url}, indent=2))
        return

    priced = []
    plausible = []
    for url, context in windows.items():
        prices = [float(x.replace(",", "")) for x in re.findall(r"\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", context)]
        if prices:
            priced.append(url)
            if max(prices) >= 90:
                plausible.append(url)
    if len(priced) < 3:
        raise AssertionError(f"Bulk Buddy craft inventory exposed prices for too few product links: {len(priced)}")
    if not plausible:
        raise AssertionError("Bulk Buddy live listing has no price range plausibly containing a 1 Ounce package")
    print(json.dumps({"status": "PASS", "elapsed_s": round(elapsed, 3), "craft_product_links": len(windows), "priced_links": len(priced), "plausible_ounce_links": len(plausible), "final_url": final_url}, indent=2))


def validate_bridge():
    payload, raw, elapsed = load_canna()
    compact = compact_payload(payload)
    encoded = json.dumps(compact, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(encoded) >= BRIDGE_LIMIT:
        raise AssertionError(f"Compact Canna payload exceeds bridge limit: {len(encoded)} bytes")
    reparsed = json.loads(encoded)
    if not isinstance(reparsed.get("data"), list) or not isinstance(reparsed.get("pagination"), dict):
        raise AssertionError("Compacted bridge payload lost required structure")
    accepted = accepted_canna(reparsed)
    if not accepted:
        raise AssertionError("Compacted bridge payload lost all eligible products")
    ratio = len(encoded) / max(1, len(raw))
    if ratio >= 0.75:
        raise AssertionError(f"Compaction ineffective: compact/raw ratio {ratio:.3f}")
    out = Path("build/validation/canna-compact.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(encoded)
    print(json.dumps({"status": "PASS", "raw_bytes": len(raw), "compact_bytes": len(encoded), "ratio": round(ratio, 4), "eligible_after_compaction": len(accepted), "source_elapsed_s": round(elapsed, 3)}, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("canna", "bulk", "bridge"))
    args = parser.parse_args()
    if args.mode == "canna":
        validate_canna()
    elif args.mode == "bulk":
        validate_bulk()
    else:
        validate_bridge()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"VALIDATION FAILED: {exc}", file=sys.stderr)
        raise
