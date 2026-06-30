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
    shortlist: scores.slice(0, 3),
    context: 'Legal adult-use cannabis research context: Canada. This tool compares public listing signals for further consideration and does not direct purchase or make medical/safety claims.'
  };
}

export function formatRecommendation(result: RecommendationResult): string {
  const craftScores = result.scores
    .filter((score) => isCraftFlower(score.product))
    .sort((a, b) => listingScore(b.product) - listingScore(a.product));

  const lines: string[] = [];
  lines.push('');
  lines.push(`${c.bold}${c.green}╔════════════════════════════════════════════════════╗${c.reset}`);
  lines.push(`${c.bold}${c.green}║          COMPA CANA · CRAFT FLOWER RANKER          ║${c.reset}`);
  lines.push(`${c.bold}${c.green}╚════════════════════════════════════════════════════╝${c.reset}`);
  lines.push('');
  lines.push(`${c.gray}Batch:${c.reset} ${result.batchDate}`);
  lines.push(`${c.gray}Source:${c.reset} ${result.sourceUrl}`);
  lines.push(`${c.gray}Scope:${c.reset} ${c.bold}Craft cannabis flower only${c.reset}`);
  lines.push(`${c.gray}Excluded:${c.reset} kief, hash, edibles, pre-rolls, vapes, extracts, CBD candy`);
  lines.push('');

  if (!craftScores.length) {
    lines.push(`${c.yellow}${c.bold}No craft flower products were parsed.${c.reset}`);
    lines.push(`${c.gray}The scraper fetched HTML, but no products passed the craft-flower filter.${c.reset}`);
    return lines.join('\n');
  }

  lines.push(`${c.bold}${c.cyan}TOP CRAFT FLOWER PICKS${c.reset}`);
  lines.push(`${c.gray}Ranking uses listing signals: rating, review count, craft label, strain type, and visible starting price.${c.reset}`);
  lines.push('');

  craftScores.slice(0, 8).forEach((score, index) => {
    const p = score.product;
    const rank = index + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '•';
    const name = value(p.name);
    const strain = value(p.terpeneDescription);
    const scoreValue = listingScore(p);

    lines.push(`${c.bold}${medal} #${rank} ${name}${c.reset}`);
    lines.push(`   ${c.magenta}Type:${c.reset} ${strain}`);
    lines.push(`   ${c.green}Rating:${c.reset} ${ratingText(p)}`);
    lines.push(`   ${c.yellow}Price signal:${c.reset} ${priceText(p)}`);
    lines.push(`   ${c.cyan}Listing score:${c.reset} ${scoreValue}/100`);
    lines.push(`   ${c.gray}${explainPick(p)}${c.reset}`);
    lines.push('');
  });

  lines.push(`${c.bold}${c.blue}3 OZ VARIETY VS QUARTER POUND CHECK${c.reset}`);
  lines.push('');
  lines.push(`${c.bold}Your rule:${c.reset}`);
  lines.push(`  • Ignore sitewide discount banners.`);
  lines.push(`  • 3 oz gives variety across strains.`);
  lines.push(`  • Quarter pound means one strain only.`);
  lines.push(`  • Recommend one QP only if value is clearly better than 3 oz variety.`);
  lines.push('');
  lines.push(`${c.bold}Current limitation:${c.reset}`);
  lines.push(`  Category cards show starting prices, but not reliable 3 oz/QP variant prices.`);
  lines.push(`  So this version does ${c.underline}not${c.reset} force a QP recommendation from incomplete data.`);
  lines.push('');
  lines.push(`${c.bold}Decision rule for the next price-detail upgrade:${c.reset}`);
  lines.push(`  Pick one QP only if its $/g is at least ${c.green}12–15% cheaper${c.reset} than the best 3 oz variety basket after the 35% bulk discount.`);
  lines.push(`  Otherwise, prefer 3 oz variety because strain diversity matters.`);
  lines.push('');
  lines.push(`${c.bold}${c.cyan}BEST CURRENT SHORTLIST${c.reset}`);
  craftScores.slice(0, 3).forEach((score, index) => {
    const p = score.product;
    lines.push(`  ${index + 1}. ${c.bold}${value(p.name)}${c.reset} · ${value(p.terpeneDescription)} · ${ratingText(p)} · ${priceText(p)}`);
  });
  lines.push('');
  lines.push(`${c.gray}Research comparison only. Legal adult-use Canada context. No medical or safety claims.${c.reset}`);
  lines.push('');

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

function explainPick(product: Product): string {
  const notes: string[] = [];
  if ((product.reviewRating.value ?? 0) >= 4.8) notes.push('strong rating');
  if ((product.reviewCount.value ?? 0) >= 100) notes.push('high review volume');
  if ((product.price.value ?? Infinity) <= 17) notes.push('better visible starting price');
  if (product.terpeneDescription.value) notes.push(`${product.terpeneDescription.value} craft flower`);
  return notes.length ? `Why it ranks: ${notes.join(', ')}.` : 'Why it ranks: limited listing data, but it passed the craft-flower filter.';
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
