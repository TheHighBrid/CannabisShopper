import { Product, ProductScore, RecommendationResult } from './types.js';

export function buildRecommendationResult(
  sourceUrl: string,
  products: Product[],
  scores: ProductScore[]
): RecommendationResult {
  return {
    batchDate: new Date().toISOString(),
    sourceUrl,
    products,
    scores,
    shortlist: scores
      .filter((score) => score.product.availability.status !== 'unavailable')
      .slice(0, 3),
    context: 'Legal adult-use cannabis research context: Canada. This tool compares public craft-flower listing signals and does not direct purchase or make medical or safety claims.'
  };
}

export function formatRecommendation(result: RecommendationResult): string {
  const lines: string[] = [];
  lines.push('# CanShop craft flower comparison');
  lines.push(`Batch date: ${result.batchDate}`);
  lines.push(`Source: ${result.sourceUrl}`);
  lines.push('Context: legal-age adult-use cannabis research in Canada. Craft flower only. No purchase direction or medical claims.');
  lines.push('Excluded formats: kief, hash, pre-rolls, edibles, vapes, extracts, concentrates, CBD candy, shake, and trim.');
  lines.push('');

  if (!result.scores.length) {
    lines.push('No eligible craft-flower listings were parsed. The Android app can follow individual product pages, while the CLI accepts saved search-result HTML.');
    return lines.join('\n');
  }

  lines.push('## Product comparison table');
  lines.push('| Product | Availability | Price | Size | $/g | THC | CBD | Flavour/terpene | Reviews | Data flags | Score |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|---:|---|---:|');
  for (const score of result.scores) lines.push(formatProductRow(score));
  lines.push('');
  lines.push('## Research shortlist');

  result.shortlist.forEach((score, index) => {
    lines.push(`### ${index + 1}. ${escapeText(field(score.product.name))} - ${score.total}/100`);
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

function formatProductRow(score: ProductScore): string {
  const product = score.product;
  const flags = [
    ...product.missingFields.map((name) => `${name}:missing`),
    ...product.unreliableFields.map((name) => `${name}:unreliable`)
  ];

  return [
    field(product.name),
    field(product.availability),
    money(product.price.value),
    grams(product.packageSizeGrams.value),
    money(product.pricePerGram.value),
    percent(product.thcPercent.value),
    percent(product.cbdPercent.value),
    field(product.terpeneDescription),
    reviewText(product),
    flags.length ? flags.join(', ') : 'none',
    String(score.total)
  ].map(escapeCell).join('|').replace(/^/, '|').replace(/$/, '|');
}

function field<T>(marker: { value: T | null; status: string; note?: string }): string {
  if (marker.value == null) {
    return `[${marker.status}]${marker.note ? ` ${marker.note}` : ''}`;
  }
  return `${marker.value}${marker.status === 'derived' ? ' (calc)' : ''}`;
}

function reviewText(product: Product): string {
  const rating = product.reviewRating.value == null
    ? 'rating missing'
    : `${product.reviewRating.value}/5`;
  const count = product.reviewCount.value == null
    ? 'count missing'
    : `${product.reviewCount.value}`;
  return `${rating}, ${count}`;
}

function money(value: number | null): string {
  return value == null
    ? '[missing]'
    : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

function grams(value: number | null): string {
  return value == null ? '[missing]' : `${value}g`;
}

function percent(value: number | null): string {
  return value == null ? '[missing]' : `${value}%`;
}

function escapeCell(value: string): string {
  return escapeText(value).replace(/\|/g, '/');
}

function escapeText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
