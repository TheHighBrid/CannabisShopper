import { Product, ProductScore, RecommendationResult } from './types.js';

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
  const lines: string[] = [];
  lines.push(`# Cannabis flower comparison — research batch`);
  lines.push(`Batch date: ${result.batchDate}`);
  lines.push(`Source: ${result.sourceUrl}`);
  lines.push('Context: legal adult-use cannabis research in Canada. Picks are for further consideration only — no purchase direction, no medical claims.');
  lines.push('Tone check: quick, casual, analytical — the shortlist is the “worth-a-look” stack, not a command to cop anything.');
  lines.push('');
  lines.push('## Product comparison table');
  lines.push('| Product | Availability | Price | Size | $/g | THC | CBD | Flavour/terpene | Reviews | Data flags | Score |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|---:|---|---:|');
  for (const score of result.scores) lines.push(formatProductRow(score));
  lines.push('');
  lines.push('## Best overall shortlist — up to 3 for further consideration');
  result.shortlist.forEach((score, index) => {
    lines.push(`### ${index + 1}. ${field(score.product.name)} — ${score.total}/100`);
    lines.push(`Why it made the cut: ${score.reasons.slice(0, 3).join(' ') || 'Balanced available signals versus the rest of the batch.'}`);
    if (score.cautions.length) lines.push(`Watch-outs: ${score.cautions.join(' ')}`);
    lines.push('');
  });
  lines.push('## Better-value discount read');
  const discounted = result.scores.filter((score) => score.product.discountDetails.value);
  if (discounted.length) {
    for (const score of discounted) {
      lines.push(`- ${field(score.product.name)}: ${field(score.product.discountDetails)}; compare against calculated ${money(score.product.pricePerGram.value)}/g before treating it as a better-value play.`);
    }
  } else {
    lines.push('- No reliable discount details were detected in this batch, so value ranking leans on calculated price-per-gram only.');
  }
  lines.push('');
  lines.push('## Order-history update template');
  lines.push('- productName:');
  lines.push('- rating: 1-5');
  lines.push('- notes: flavour, freshness, burn, packaging, and whether the listing matched reality');
  lines.push('- flavoursLiked: []');
  lines.push('- wouldReconsider: true/false');
  return lines.join('\n');
}

function formatProductRow(score: ProductScore): string {
  const p = score.product;
  const flags = [...p.missingFields.map((f) => `${f}:missing`), ...p.unreliableFields.map((f) => `${f}:unreliable`)];
  return [
    field(p.name),
    field(p.availability),
    money(p.price.value),
    grams(p.packageSizeGrams.value),
    money(p.pricePerGram.value),
    percent(p.thcPercent.value),
    percent(p.cbdPercent.value),
    field(p.terpeneDescription),
    reviewText(p),
    flags.length ? flags.join(', ') : 'none',
    String(score.total)
  ].map(escapeCell).join('|').replace(/^/, '|').replace(/$/, '|');
}

function field<T>(marker: { value: T | null; status: string; note?: string }): string {
  if (marker.value == null) return `[${marker.status}]${marker.note ? ` ${marker.note}` : ''}`;
  return `${marker.value}${marker.status === 'derived' ? ' (calc)' : ''}`;
}

function reviewText(product: Product): string {
  const rating = product.reviewRating.value == null ? 'rating missing' : `${product.reviewRating.value}/5`;
  const count = product.reviewCount.value == null ? 'count missing' : `${product.reviewCount.value}`;
  return `${rating}, ${count}`;
}

function money(value: number | null): string {
  return value == null ? '[missing]' : `$${value.toFixed(2)}`;
}

function grams(value: number | null): string {
  return value == null ? '[missing]' : `${value}g`;
}

function percent(value: number | null): string {
  return value == null ? '[missing]' : `${value}%`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '/');
}
