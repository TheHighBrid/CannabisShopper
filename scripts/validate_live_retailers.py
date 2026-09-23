#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
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


class ProductCardParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.capture = False
        self.depth = 0
        self.parts = []
        self.cards = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set((attrs.get("class") or "").split())
        if not self.capture and tag == "li" and "product" in classes:
            self.capture = True
            self.depth = 1
            self.parts = []
        elif self.capture:
            self.depth += 1

    def handle_endtag(self, tag):
        if self.capture:
            self.depth -= 1
            if self.depth == 0:
                self.cards.append(" ".join(self.parts))
                self.capture = False

    def handle_data(self, data):
        if self.capture:
            text = " ".join(data.split())
            if text:
                self.parts.append(text)


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
    html = raw.decode("utf-8", "ignore")
    parser = ProductCardParser()
    parser.feed(html)
    craft = []
    for card in parser.cards:
        if "craft" not in card.lower():
            continue
        prices = [float(x.replace(",", "")) for x in re.findall(r"\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", card)]
        craft.append({"text": card[:180], "min": min(prices) if prices else None, "max": max(prices) if prices else None})
    if len(craft) < 4:
        raise AssertionError(f"Bulk Buddy craft search returned too few product cards: {len(craft)}")
    plausible = [item for item in craft if item["max"] is None or item["max"] >= 90]
    if not plausible:
        raise AssertionError("Bulk Buddy live listing has no plausible 1 Ounce candidates")
    print(json.dumps({"status": "PASS", "elapsed_s": round(elapsed, 3), "craft_cards": len(craft), "plausible_ounce_cards": len(plausible), "final_url": final_url}, indent=2))


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
