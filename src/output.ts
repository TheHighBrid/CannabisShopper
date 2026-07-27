import { Product, ProductScore, RecommendationResult } from './types.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

export function buildRecommendationResult(sourceUrl: string, products: Product[], scores: ProductScore[]): RecommendationResult {
  return {
    batchDate: new Date().toISOString(),
    sourceUrl,
    products,
    scores,
    shortlist: scores.filter((score) => score.product.availability.status !== 'unavailable').slice(0, 3),
    context: 'Legal adult-use cannabis research context: Canada. This tool compares public craft-flower listing signals and does not direct purchase or make medical or safety claims.'
  };
}

export function formatRecommendation(result: RecommendationResult): string {
  const craftScores = result.scores
    .filter((score) => isCraftFlower(score.product))
    .sort((a, b) => listingScore(b.product) - listingScore(a.product));

  const lines: string[] = [];
  lines.push('# CanShop craft flower comparison');
  lines.push(`Batch date: ${result.batchDate}`);
  lines.push(`Source: ${result.sourceUrl}`);
  lines.push('Context: legal-age adult-use cannabis research in Canada. Craft flower only. Discounts are ignored. No purchase direction or medical claims.');
  lines.push('Excluded formats: kief, hash, pre-rolls, edibles, vapes, extracts, concentrates, and CBD candy.');
  lines.push('Package rule: a single-strain quarter pound must be at least 15% cheaper per gram than the best three-ounce variety bundle, with comparable transparency, to avoid a ranking penalty.');
  lines.push('');

  if (!result.scores.length) {
    lines.push('No eligible craft-flower listings were parsed. Use a saved HTML file or manual Android entry and verify the source layout.');
    return lines.join('\n');
  }

  lines.push('## Product comparison table');
  lines.push('| Product | Availability | Regular price | Size | $/g | THC | CBD | Flavour/terpene | Reviews | Data flags | Score |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|---:|---|---:|');
  for (const score of result.scores) lines.push(formatProductRow(score));
  lines.push('');
  lines.push('## Research shortlist');
  result.shortlist.forEach((score, index) => {
    lines.push(`### ${index + 1}. ${field(score.product.name)} — ${score.total}/100`);
    lines.push(`Why it surfaced: ${score.reasons.slice(0, 3).join(' ') || 'Balanced available signals versus the rest of the batch.'}`);
    if (score.cautions.length) lines.push(`Watch-outs: ${score.cautions.join(' ')}`);
    lines.push('');
  });
  lines.push('## Order-history update template');
  lines.push('- productName:');
  lines.push('- rating: 1-5');
  lines.push('- notes: flavour, freshness, burn, packaging, and whether the listing matched reality');
  lines.push('- flavoursLiked: []');
  lines.push('- wouldReconsider: true/false');
  return lines.join('\n');
}

function isCraftFlower(product: Product): boolean {
  const name = product.name.value?.toLowerCase() ?? '';
  if (!name.includes('craft')) return false;

  const blocked = ['kief', 'hash', 'pre-roll', 'pre rolled', 'joint', 'gummy', 'edible', 'extract', 'vape', 'cart', 'cartridge', 'shatter', 'wax', 'rosin', 'distillate', 'cbd'];
  return !blocked.some((word) => name.includes(word));
}

function listingScore(product: Product): number {
  const rating = product.reviewRating.value;
  const reviews = product.reviewCount.value;
  const price = product.price.value;

  const ratingPart = rating == null ? 0 : (rating / 5) * 55;
  const reviewPart = reviews == null ? 0 : Math.min(25, (Math.log10(reviews + 1) / Math.log10(201)) * 25);
  const craftPart = 10;
  const pricePart = price == null ? 0 : price <= 17 ? 10 : price <= 18 ? 8 : price <= 20 ? 5 : 2;

  return Math.round((ratingPart + reviewPart + craftPart + pricePart) * 10) / 10;
}

function money(value: number | null): string {
  return value == null ? '[missing]' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

function value(marker: { value: string | null; status: string; note?: string }): string {
  return marker.value ?? 'missing';
}

function ratingText(product: Product): string {
  const rating = product.reviewRating.value == null ? 'rating missing' : `${product.reviewRating.value}/5`;
  const count = product.reviewCount.value == null ? 'reviews missing' : `${product.reviewCount.value} reviews`;
  return `${rating}, ${count}`;
}

function priceText(product: Product): string {
  return product.price.value == null ? 'price missing' : `$${product.price.value.toFixed(2)} starting`;
}
