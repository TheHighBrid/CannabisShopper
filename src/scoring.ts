import { OrderHistoryEntry, Product, ProductScore, UserPreferences } from './types.js';

const WEIGHTS = {
  thcCbdRiskBalance: 25,
  priceValue: 20,
  transparency: 15,
  reviewQualityVolume: 15,
  flavourMatch: 15,
  orderHistoryMatch: 10
};
const THREE_OZ_MIN = 80;
const THREE_OZ_MAX = 90;
const QP_MIN = 108;
const QP_MAX = 118;
const SIGNIFICANT_QP_VALUE_THRESHOLD = 0.85;

export function scoreProducts(
  products: Product[],
  preferences: UserPreferences = {},
  history: OrderHistoryEntry[] = []
): ProductScore[] {
  const validPrices = products.map((p) => p.pricePerGram.value).filter((v): v is number => typeof v === 'number');
  const minPrice = validPrices.length ? Math.min(...validPrices) : Number.NaN;
  const maxPrice = validPrices.length ? Math.max(...validPrices) : Number.NaN;

  const scored = products.map((product) => scoreProduct(product, preferences, history, minPrice, maxPrice));
  return applyThreeOunceVsQuarterPoundRule(scored).sort((a, b) => b.total - a.total);
}

function scoreProduct(
  product: Product,
  preferences: UserPreferences,
  history: OrderHistoryEntry[],
  minPrice: number,
  maxPrice: number
): ProductScore {
  const reasons: string[] = [];
  const cautions: string[] = [];

  const thcCbdRiskBalance = scoreCannabinoids(product, preferences, reasons, cautions) * WEIGHTS.thcCbdRiskBalance;
  const priceValue = scorePrice(product, minPrice, maxPrice, reasons, cautions) * WEIGHTS.priceValue;
  const transparency = scoreTransparency(product, preferences, reasons, cautions) * WEIGHTS.transparency;
  const reviewQualityVolume = scoreReviews(product, reasons, cautions) * WEIGHTS.reviewQualityVolume;
  const flavourMatch = scoreFlavour(product, preferences, history, reasons, cautions) * WEIGHTS.flavourMatch;
  const orderHistoryMatch = scoreHistory(product, history, reasons) * WEIGHTS.orderHistoryMatch;

  const total = round(thcCbdRiskBalance + priceValue + transparency + reviewQualityVolume + flavourMatch + orderHistoryMatch);

  return {
    product,
    total,
    components: {
      thcCbdRiskBalance: round(thcCbdRiskBalance),
      priceValue: round(priceValue),
      transparency: round(transparency),
      reviewQualityVolume: round(reviewQualityVolume),
      flavourMatch: round(flavourMatch),
      orderHistoryMatch: round(orderHistoryMatch)
    },
    reasons,
    cautions
  };
}

function applyThreeOunceVsQuarterPoundRule(scores: ProductScore[]): ProductScore[] {
  const varieties = scores.filter(({ product }) =>
    product.isVarietyBundle &&
    inRange(product.packageSizeGrams.value, THREE_OZ_MIN, THREE_OZ_MAX) &&
    product.pricePerGram.value != null
  );
  const quarterPounds = scores.filter(({ product }) =>
    inRange(product.packageSizeGrams.value, QP_MIN, QP_MAX) &&
    product.pricePerGram.value != null
  );
  if (!varieties.length || !quarterPounds.length) return scores;

  const bestVariety = [...varieties].sort(
    (a, b) => (a.product.pricePerGram.value ?? Infinity) - (b.product.pricePerGram.value ?? Infinity)
  )[0];
  const bestVarietyPrice = bestVariety.product.pricePerGram.value;
  if (bestVarietyPrice == null) return scores;

  return scores.map((score) => {
    if (!quarterPounds.includes(score)) return score;
    const qpPrice = score.product.pricePerGram.value;
    if (qpPrice == null) return score;

    const comparableTransparency = score.components.transparency >= bestVariety.components.transparency - 1.5;
    const significantlyCheaper = qpPrice <= bestVarietyPrice * SIGNIFICANT_QP_VALUE_THRESHOLD;
    if (significantlyCheaper && comparableTransparency) {
      score.reasons.push('Quarter pound clears the 15% value threshold versus the best three-ounce variety bundle.');
      return score;
    }

    score.total = round(Math.max(0, score.total - 12));
    score.cautions.push('Single-strain quarter pound does not clear the 15% value threshold versus the best three-ounce variety bundle.');
    return score;
  });
}

function scoreCannabinoids(product: Product, preferences: UserPreferences, reasons: string[], cautions: string[]): number {
  const thc = product.thcPercent.value;
  const cbd = product.cbdPercent.value;
  if (thc == null && cbd == null) {
    cautions.push('Cannabinoid data is missing, so profile completeness is capped.');
    return 0.2;
  }

  let score = 0.55;
  if (thc != null) {
    const target = preferences.targetThcPercent ?? 24;
    score += Math.max(0, 0.3 - Math.abs(thc - target) / 100);
    if (preferences.maxThcPercent != null && thc > preferences.maxThcPercent) {
      score -= 0.25;
      cautions.push(`THC ${thc}% is above the stated preference maximum.`);
    }
  }
  if (cbd != null && preferences.minCbdPercent != null) {
    score += cbd >= preferences.minCbdPercent ? 0.15 : -0.1;
  }
  reasons.push('Cannabinoid fields were compared as listing-profile data, not as a medical or safety claim.');
  return clamp(score, 0, thc == null || cbd == null ? 0.75 : 1);
}

function scorePrice(product: Product, minPrice: number, maxPrice: number, reasons: string[], cautions: string[]): number {
  const ppg = product.pricePerGram.value;
  if (ppg == null || !Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    cautions.push('Value score is capped because regular listed price per gram could not be calculated.');
    return 0.25;
  }
  if (minPrice === maxPrice) return 0.8;
  const score = 1 - (ppg - minPrice) / (maxPrice - minPrice);
  reasons.push(`Value uses the regular listed price, with discounts ignored: $${ppg.toFixed(2)}/g.`);
  return clamp(score, 0.1, 1);
}

function scoreTransparency(product: Product, preferences: UserPreferences, reasons: string[], cautions: string[]): number {
  const tracked = ['price', 'packageSizeGrams', 'pricePerGram', 'thcPercent', 'cbdPercent', 'terpeneDescription', 'reviewCount', 'reviewRating', 'availability'] as const;
  const presentCount = tracked.filter((field) => product[field].status === 'present' || product[field].status === 'derived').length;
  const base = presentCount / tracked.length;
  if (base < 0.6) cautions.push('Several listing fields are missing, so transparency is limited.');
  if (preferences.transparencyPriority === 'high' && base > 0.75) reasons.push('Listing has stronger-than-average field coverage.');
  return clamp(base, 0, 1);
}

function scoreReviews(product: Product, reasons: string[], cautions: string[]): number {
  const count = product.reviewCount.value;
  const rating = product.reviewRating.value;
  if (count == null || rating == null) {
    cautions.push('Review signal is incomplete and not over-scored.');
    return 0.25;
  }
  const volume = Math.min(1, Math.log10(count + 1) / 2);
  const quality = clamp(rating / 5, 0, 1);
  reasons.push(`Review signal combines ${count} review(s) with ${rating}/5 rating.`);
  return quality * 0.7 + volume * 0.3;
}

function scoreFlavour(
  product: Product,
  preferences: UserPreferences,
  history: OrderHistoryEntry[],
  reasons: string[],
  cautions: string[]
): number {
  const desc = product.terpeneDescription.value?.toLowerCase();
  if (!desc) {
    cautions.push('Flavour/terpene notes are missing, so preference match is capped.');
    return 0.25;
  }
  const preferred = [...(preferences.preferredFlavours ?? []), ...history.flatMap((h) => h.flavoursLiked ?? [])].map((v) => v.toLowerCase());
  if (!preferred.length) return 0.6;
  const matches = preferred.filter((flavour) => desc.includes(flavour));
  if (matches.length) reasons.push(`Flavour notes match preference(s): ${matches.join(', ')}.`);
  return matches.length ? clamp(0.55 + matches.length * 0.15, 0, 1) : 0.35;
}

function scoreHistory(product: Product, history: OrderHistoryEntry[], reasons: string[]): number {
  if (!history.length) return 0.5;
  const name = product.name.value?.toLowerCase() ?? '';
  const match = history.find((entry) => name.includes(entry.productName.toLowerCase()) || entry.productName.toLowerCase().includes(name));
  if (!match) return 0.45;
  if (match.wouldReconsider === false || match.rating < 3) return 0.15;
  reasons.push('Past order history has a positive match for this product or name family.');
  return clamp(match.rating / 5, 0, 1);
}

function inRange(value: number | null, min: number, max: number): boolean {
  return value != null && value >= min && value <= max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
