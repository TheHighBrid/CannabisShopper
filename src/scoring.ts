import { OrderHistoryEntry, Product, ProductScore, UserPreferences } from './types.js';

const WEIGHTS = {
  thcCbdRiskBalance: 25,
  priceValue: 20,
  transparency: 15,
  reviewQualityVolume: 15,
  flavourMatch: 15,
  orderHistoryMatch: 10
};

export function scoreProducts(
  products: Product[],
  preferences: UserPreferences = {},
  history: OrderHistoryEntry[] = []
): ProductScore[] {
  const validPrices = products.map((p) => p.pricePerGram.value).filter((v): v is number => typeof v === 'number');
  const minPrice = Math.min(...validPrices);
  const maxPrice = Math.max(...validPrices);

  return products
    .map((product) => scoreProduct(product, preferences, history, minPrice, maxPrice))
    .sort((a, b) => b.total - a.total);
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

function scoreCannabinoids(product: Product, preferences: UserPreferences, reasons: string[], cautions: string[]): number {
  const thc = product.thcPercent.value;
  const cbd = product.cbdPercent.value;
  if (thc == null && cbd == null) {
    cautions.push('Cannabinoid data is missing, so THC/CBD balance is capped hard.');
    return 0.2;
  }

  let score = 0.55;
  if (thc != null) {
    const target = preferences.targetThcPercent ?? 24;
    score += Math.max(0, 0.3 - Math.abs(thc - target) / 100);
    if (preferences.maxThcPercent != null && thc > preferences.maxThcPercent) {
      score -= 0.25;
      cautions.push(`THC ${thc}% is above the stated max preference.`);
    }
  }
  if (cbd != null && preferences.minCbdPercent != null) {
    score += cbd >= preferences.minCbdPercent ? 0.15 : -0.1;
  }
  reasons.push('Cannabinoid profile was considered as a research risk-balance signal, not a safety claim.');
  return clamp(score, 0, thc == null || cbd == null ? 0.75 : 1);
}

function scorePrice(product: Product, minPrice: number, maxPrice: number, reasons: string[], cautions: string[]): number {
  const ppg = product.pricePerGram.value;
  if (ppg == null || !Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    cautions.push('Value score is capped because price-per-gram could not be calculated.');
    return 0.25;
  }
  if (minPrice === maxPrice) return 0.8;
  const score = 1 - (ppg - minPrice) / (maxPrice - minPrice);
  reasons.push(`Value check uses calculated price-per-gram: $${ppg.toFixed(2)}/g.`);
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
  reasons.push('Past order history has a positive match for this product/name family.');
  return clamp(match.rating / 5, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
