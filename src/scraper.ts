import { FieldMarker, Product } from './types.js';

const SOURCE_URL = 'https://www.bulkbuddy.co/product-category/cannabis/craft-cannabis-flowers/';

const missing = <T>(note = 'Not found on listing page'): FieldMarker<T> => ({ value: null, status: 'missing', note });
const present = <T>(value: T): FieldMarker<T> => ({ value, status: 'present' });
const derived = <T>(value: T, note: string): FieldMarker<T> => ({ value, status: 'derived', note });
const unavailable = <T>(note: string): FieldMarker<T> => ({ value: null, status: 'unavailable', note });

export async function fetchProductListing(url = SOURCE_URL): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-CA,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function parseProducts(html: string, sourceUrl = SOURCE_URL): Product[] {
  const products = splitProductCards(html)
    .map((card) => parseProductCard(card, sourceUrl))
    .filter((product): product is Product => Boolean(product?.name.value))
    .filter(isCraftFlowerProduct);

  if (!products.length) {
    const diagnostics = [
      `product-wrapper matches: ${countMatches(html, /product-wrapper/gi)}`,
      `product-title matches: ${countMatches(html, /product-title/gi)}`,
      `product URL matches: ${countMatches(html, new RegExp('/product/', 'gi'))}`,
      `price matches: ${countMatches(html, /woocommerce-Price-amount|\$\s*[0-9]/gi)}`
    ].join(', ');

    throw new Error(`No craft flower products parsed from source HTML. Diagnostics: ${diagnostics}`);
  }

  return products;
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
    firstMatch(cardHtml, /<h[1-6][^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ??
      firstMatch(cardHtml, /<a[^>]+href=["'][^"']*\/product\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i) ??
      firstMatch(cardHtml, /class=["'][^"']*(?:woocommerce-loop-product__title|product-title)[^"']*["'][^>]*>([\s\S]*?)<\//i) ??
      ''
  );

  if (!nameText) return null;

  const price = parsePrice(cardHtml);
  const packageSize = parsePackageSize(text) ?? parsePackageSize(nameText);
  const thc = parsePercentNearLabel(text, 'THC');
  const cbd = parsePercentNearLabel(text, 'CBD');
  const reviewCount = parseReviewCount(cardHtml, text);
  const reviewRating = parseRating(cardHtml, text);
  const strain = cleanHtml(extractClassText(cardHtml, 'gs_strain') ?? '');
  const terpene = parseTerpeneDescription(text) ?? (strain || null);
  const availability = parseAvailability(text, cardHtml);

  const product: Product = {
    sourceUrl: productUrl,
    name: present(nameText),
    price: price == null ? missing('Price missing or unreadable') : present(price),
    packageSizeGrams: packageSize == null ? missing('Package size missing or unreadable') : present(packageSize),
    pricePerGram:
      price != null && packageSize != null && packageSize > 0
        ? derived(round(price / packageSize), 'Calculated from listing price and package size')
        : missing('Needs both price and package size'),
    thcPercent: thc == null ? missing('THC percentage missing on listing card') : present(thc),
    cbdPercent: cbd == null ? missing('CBD percentage missing on listing card') : present(cbd),
    terpeneDescription: terpene ? present(terpene) : missing('Terpene/flavour notes missing on listing card'),
    reviewCount: reviewCount == null ? missing('Review count missing') : present(reviewCount),
    reviewRating: reviewRating == null ? missing('Review rating missing') : present(reviewRating),
    availability,
    discountDetails: missing('Sitewide bulk discount intentionally ignored'),
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

function splitProductCards(html: string): string[] {
  const wrapperStarts = collectStarts(html, /<div[^>]+class=["'][^"']*\bproduct-wrapper\b[^"']*["'][^>]*>/gi);
  if (wrapperStarts.length) return sliceByStarts(html, wrapperStarts);

  const typeStarts = collectStarts(html, /<div[^>]+class=["'][^"']*\bproduct-type-3\b[^"']*["'][^>]*>/gi);
  if (typeStarts.length) return sliceByStarts(html, typeStarts);

  const liStarts = collectStarts(html, /<li[^>]+class=["'][^"']*(?:\bproduct\b|\btype-product\b)[^"']*["'][^>]*>/gi);
  if (liStarts.length) return sliceByStarts(html, liStarts);

  const titleStarts = collectStarts(html, /<h[1-6][^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>/gi);
  if (titleStarts.length) {
    return titleStarts.map((start, index) => {
      const from = Math.max(0, start - 2500);
      const to = titleStarts[index + 1] ?? Math.min(html.length, start + 12000);
      return html.slice(from, to);
    });
  }

  const productLinkStarts = collectStarts(html, /<a[^>]+href=["'][^"']*\/product\/[^"']+["'][^>]*>/gi);
  return productLinkStarts.map((start, index) => {
    const from = Math.max(0, start - 2500);
    const to = productLinkStarts[index + 1] ?? Math.min(html.length, start + 12000);
    return html.slice(from, to);
  });
}

function isCraftFlowerProduct(product: Product): boolean {
  const name = product.name.value?.toLowerCase() ?? '';
  if (!name.includes('craft')) return false;

  const blocked = [
    'kief', 'hash', 'pre-roll', 'pre rolled', 'joint', 'joints', 'gummy', 'gummies',
    'edible', 'edibles', 'extract', 'extracts', 'vape', 'cart', 'cartridge', 'shatter',
    'wax', 'rosin', 'distillate', 'cbd', 'twisted extracts'
  ];

  return !blocked.some((word) => name.includes(word));
}

function collectStarts(input: string, regex: RegExp): number[] {
  return [...input.matchAll(regex)].map((match) => match.index ?? 0);
}

function sliceByStarts(input: string, starts: number[]): string[] {
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? input.length;
    return input.slice(start, end);
  });
}

function parsePrice(input: string): number | null {
  const text = stripTags(input);
  const prices = [...text.matchAll(/\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g)]
    .map((match) => Number(match[1].replace(/,/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!prices.length) return null;
  return Math.min(...prices);
}

function parsePackageSize(input: string): number | null {
  const ounce = input.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:oz|ounce)/i);
  if (ounce) return round(Number(ounce[1]) * 28.3495);

  const grams = input.match(/([0-9]+(?:\.[0-9]+)?)\s*g(?:ram)?s?\b/i);
  return grams ? Number(grams[1]) : null;
}

function parsePercentNearLabel(input: string, label: 'THC' | 'CBD'): number | null {
  const after = input.match(new RegExp(`${label}[^0-9]{0,20}([0-9]+(?:\\.[0-9]+)?)\\s*%`, 'i'));
  const before = input.match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*%[^A-Za-z0-9]{0,20}${label}`, 'i'));
  const parsed = Number(after?.[1] ?? before?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseReviewCount(cardHtml: string, input: string): number | null {
  const countText = cleanHtml(extractClassText(cardHtml, 'count-text') ?? '');
  const countFromClass = Number(countText.match(/[0-9]+/)?.[0]);
  if (Number.isFinite(countFromClass) && countFromClass > 0) return countFromClass;

  const match = input.match(/([0-9]+)\s*(?:customer\s*)?reviews?/i);
  return match ? Number(match[1]) : null;
}

function parseRating(cardHtml: string, input: string): number | null {
  const strongRating = cleanHtml(
    firstMatch(cardHtml, /<strong[^>]*class=["'][^"']*\brating\b[^"']*["'][^>]*>([\s\S]*?)<\/strong>/i) ?? ''
  );
  const parsedStrong = Number(strongRating);
  if (Number.isFinite(parsedStrong) && parsedStrong > 0) return parsedStrong;

  const source = `${firstMatch(cardHtml, /aria-label=["']([^"']*Rated[^"']*)["']/i) ?? ''} ${input}`;
  const match = source.match(/Rated\s+([0-9.]+)\s+out of 5/i) ?? source.match(/([0-9.]+)\s*\/\s*5/);
  return match ? Number(match[1]) : null;
}

function parseTerpeneDescription(input: string): string | null {
  const match = input.match(/(?:terpene|flavou?r|aroma|taste|strain)s?:?\s*([^.|]{3,140})/i);
  return match ? normalize(match[1]) : null;
}

function parseAvailability(input: string, cardHtml: string): FieldMarker<string> {
  if (/out of stock|sold out|unavailable/i.test(input)) return unavailable('Listing indicates out of stock or unavailable');
  if (/in stock|add to cart|select options|add_to_cart_button|product_type_variable/i.test(`${input} ${cardHtml}`)) {
    return present('Available or selectable on listing');
  }
  return missing('Availability not explicit on listing card');
}

function extractClassText(input: string, className: string): string | null {
  const regex = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
  return firstMatch(input, regex);
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

function countMatches(input: string, regex: RegExp): number {
  return [...input.matchAll(regex)].length;
}

function isField(value: unknown): value is FieldMarker<unknown> {
  return Boolean(value && typeof value === 'object' && 'status' in value && 'value' in value);
}
