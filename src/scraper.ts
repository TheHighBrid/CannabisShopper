import { FieldMarker, Product } from './types.js';

const SOURCE_URL = 'https://www.bulkbuddy.co/?term=craft-cannabis-flowers&s=&post_type=product&taxonomy=product_cat';
const EXCLUDED_FORMATS = [
  'kief',
  'hash',
  'pre-roll',
  'preroll',
  'edible',
  'gummy',
  'vape',
  'cartridge',
  'extract',
  'concentrate',
  'shatter',
  'rosin',
  'resin',
  'cbd candy',
  'shake',
  'trim'
];

const missing = <T>(note = 'Not found on listing page'): FieldMarker<T> => ({
  value: null,
  status: 'missing',
  note
});
const present = <T>(value: T): FieldMarker<T> => ({ value, status: 'present' });
const derived = <T>(value: T, note: string): FieldMarker<T> => ({
  value,
  status: 'derived',
  note
});
const unavailable = <T>(note: string): FieldMarker<T> => ({
  value: null,
  status: 'unavailable',
  note
});

export async function fetchProductListing(url = SOURCE_URL): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 CanShop/1.0.1',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-CA,en;q=0.9'
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > 6 * 1024 * 1024) {
    throw new Error('Listing response exceeded the 6 MB safety limit.');
  }

  return response.text();
}

export function parseProducts(html: string, sourceUrl = SOURCE_URL): Product[] {
  return splitProductCards(html)
    .map((card) => parseProductCard(card, sourceUrl))
    .filter((product): product is Product => Boolean(product?.name.value))
    .filter(isEligibleCraftFlower);
}

export async function scrapeProducts(url = SOURCE_URL): Promise<Product[]> {
  return parseProducts(await fetchProductListing(url), url);
}

function parseProductCard(cardHtml: string, sourceUrl: string): Product | null {
  const text = normalize(stripTags(cardHtml));
  const productUrl = absolutize(
    firstMatch(cardHtml, /href=["']([^"']*\/product\/[^"']+)["']/i),
    sourceUrl
  );
  const nameText = cleanHtml(
    firstMatch(cardHtml, /class=["'][^"']*(?:woocommerce-loop-product__title|product-title)[^"']*["'][^>]*>([\s\S]*?)<\//i)
      ?? firstMatch(cardHtml, /<h[1-6][^>]*>[\s\S]*?<a[^>]+href=["'][^"']*\/product\/[^"']+["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[1-6]>/i)
      ?? ''
  );

  if (!nameText) return null;

  const price = parseRegularPrice(cardHtml, text);
  const packageSize = parsePackageSize(text) ?? parsePackageSize(nameText);
  const thc = parsePercentNearLabel(text, 'THC');
  const cbd = parsePercentNearLabel(text, 'CBD');
  const reviewCount = parseReviewCount(cardHtml, text);
  const reviewRating = parseRating(cardHtml, text);
  const terpene = parseTerpeneDescription(text);
  const availability = parseAvailability(text, cardHtml);

  const product: Product = {
    sourceUrl: productUrl,
    name: present(nameText),
    price: price == null ? missing('Regular listed price missing or unreadable') : present(price),
    packageSizeGrams: packageSize == null ? missing('Package size missing or unreadable') : present(packageSize),
    pricePerGram:
      price != null && packageSize != null && packageSize > 0
        ? derived(round(price / packageSize), 'Calculated from regular listed price and package size')
        : missing('Needs both regular listed price and package size'),
    thcPercent: thc == null ? missing('THC percentage missing on listing card') : present(thc),
    cbdPercent: cbd == null ? missing('CBD percentage missing on listing card') : present(cbd),
    terpeneDescription: terpene ? present(terpene) : missing('Flavour notes missing on listing card'),
    reviewCount: reviewCount == null ? missing('Review count missing') : present(reviewCount),
    reviewRating: reviewRating == null ? missing('Review rating missing') : present(reviewRating),
    availability,
    discountDetails: missing('Discount data is intentionally ignored'),
    isVarietyBundle: /variety|mix(?:ed)?\s*(?:ounce|oz)|3\s*oz.*(?:bundle|mix)/i.test(`${nameText} ${text}`),
    missingFields: [],
    unreliableFields: []
  };

  product.missingFields = Object.entries(product)
    .filter(([, value]) => isField(value) && value.status === 'missing')
    .map(([key]) => key)
    .filter((key) => key !== 'discountDetails');
  product.unreliableFields = Object.entries(product)
    .filter(([, value]) => isField(value) && value.status === 'unreliable')
    .map(([key]) => key);

  return product;
}

function isEligibleCraftFlower(product: Product): boolean {
  const text = `${product.name.value ?? ''} ${product.terpeneDescription.value ?? ''}`.toLowerCase();
  if (!text.includes('craft')) return false;
  return !EXCLUDED_FORMATS.some((term) => text.includes(term));
}

function splitProductCards(html: string): string[] {
  const listItems = html.match(/<li[^>]+class=["'][^"']*(?:\bproduct\b|\btype-product\b)[^"']*["'][\s\S]*?<\/li>/gi);
  if (listItems?.length) return listItems;

  const wrappers = html.match(/<div[^>]+class=["'][^"']*(?:\bproduct-wrapper\b|\bproduct-type-3\b|\btype-product\b)[^"']*["'][\s\S]*?<\/div>/gi);
  if (wrappers?.length) return wrappers;

  const starts = [...html.matchAll(/<a[^>]+href=["'][^"']*\/product\/[^"']+["'][^>]*>/gi)]
    .map((match) => match.index ?? 0);
  return starts.map((start, index) => {
    const from = Math.max(0, start - 2500);
    const to = starts[index + 1] ?? Math.min(html.length, start + 12_000);
    return html.slice(from, to);
  });
}

function parseRegularPrice(cardHtml: string, fallbackText: string): number | null {
  const deletedPriceHtml = firstMatch(cardHtml, /<del[^>]*>([\s\S]*?)<\/del>/i);
  const source = deletedPriceHtml ? stripTags(deletedPriceHtml) : fallbackText;
  const matches = [...source.matchAll(/\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g)];
  if (!matches.length) return null;
  return Number(matches[0][1].replace(/,/g, ''));
}

function parsePackageSize(input: string): number | null {
  const ounce = input.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:oz|ounce)s?\b/i);
  if (ounce) return round(Number(ounce[1]) * 28.3495);
  const grams = input.match(/([0-9]+(?:\.[0-9]+)?)\s*g(?:ram)?s?\b/i);
  return grams ? Number(grams[1]) : null;
}

function parsePercentNearLabel(input: string, label: 'THC' | 'CBD'): number | null {
  const after = input.match(new RegExp(`${label}[^0-9]{0,20}([0-9]+(?:\\.[0-9]+)?)\\s*%`, 'i'));
  const before = input.match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*%[^A-Za-z0-9]{0,20}${label}`, 'i'));
  const parsed = Number(after?.[1] ?? before?.[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseReviewCount(cardHtml: string, input: string): number | null {
  const structured = firstMatch(cardHtml, /itemprop=["']reviewCount["'][^>]+content=["']([0-9,]+)["']/i)
    ?? firstMatch(cardHtml, /content=["']([0-9,]+)["'][^>]+itemprop=["']reviewCount["']/i);
  if (structured) return Number(structured.replace(/,/g, ''));
  const match = input.match(/([0-9,]+)\s*(?:customer\s*)?(?:ratings?|reviews?)/i);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function parseRating(cardHtml: string, input: string): number | null {
  const structured = firstMatch(cardHtml, /itemprop=["']ratingValue["'][^>]+content=["']([0-9.]+)["']/i)
    ?? firstMatch(cardHtml, /content=["']([0-9.]+)["'][^>]+itemprop=["']ratingValue["']/i);
  if (structured) return Number(structured);
  const source = `${firstMatch(cardHtml, /aria-label=["']([^"']*Rated[^"']*)["']/i) ?? ''} ${input}`;
  const match = source.match(/Rated\s+([0-9.]+)\s+out of 5/i) ?? source.match(/([0-9.]+)\s*\/\s*5/);
  return match ? Number(match[1]) : null;
}

function parseTerpeneDescription(input: string): string | null {
  const match = input.match(/(?:terpene|flavou?r|aroma|taste)s?:?\s*([^.|]{3,180})/i);
  return match ? normalize(match[1]) : null;
}

function parseAvailability(input: string, cardHtml: string): FieldMarker<string> {
  if (/out of stock|sold out|unavailable/i.test(input)) {
    return unavailable('Listing indicates out of stock or unavailable');
  }
  if (/in stock|add to cart|select options|add_to_cart_button|product_type_variable/i.test(`${input} ${cardHtml}`)) {
    return present('Available or selectable on listing');
  }
  return missing('Availability not explicit on listing card');
}

function firstMatch(input: string, regex: RegExp): string | null {
  return input.match(regex)?.[1] ?? null;
}

function stripTags(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function cleanHtml(value: string): string {
  return normalize(stripTags(value));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#36;/g, '$')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
}

function absolutize(url: string | null, base: string): string {
  if (!url) return base;
  try {
    return new URL(url, base).toString();
  } catch {
    return base;
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isField(value: unknown): value is FieldMarker<unknown> {
  return Boolean(value && typeof value === 'object' && 'status' in value && 'value' in value);
}
