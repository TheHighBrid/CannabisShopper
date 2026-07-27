export type FieldReliability = 'present' | 'missing' | 'derived' | 'unreliable' | 'unavailable';

export interface FieldMarker<T> {
  value: T | null;
  status: FieldReliability;
  note?: string;
}

export interface Product {
  sourceUrl: string;
  name: FieldMarker<string>;
  price: FieldMarker<number>;
  packageSizeGrams: FieldMarker<number>;
  pricePerGram: FieldMarker<number>;
  thcPercent: FieldMarker<number>;
  cbdPercent: FieldMarker<number>;
  terpeneDescription: FieldMarker<string>;
  reviewCount: FieldMarker<number>;
  reviewRating: FieldMarker<number>;
  availability: FieldMarker<string>;
  discountDetails: FieldMarker<string>;
  isVarietyBundle: boolean;
  missingFields: string[];
  unreliableFields: string[];
}

export interface UserPreferences {
  maxThcPercent?: number;
  minCbdPercent?: number;
  targetThcPercent?: number;
  preferredFlavours?: string[];
  priceSensitivity?: 'low' | 'medium' | 'high';
  transparencyPriority?: 'low' | 'medium' | 'high';
}

export interface OrderHistoryEntry {
  productName: string;
  rating: number;
  notes?: string;
  flavoursLiked?: string[];
  wouldReconsider?: boolean;
}

export interface ProductScore {
  product: Product;
  total: number;
  components: {
    thcCbdRiskBalance: number;
    priceValue: number;
    transparency: number;
    reviewQualityVolume: number;
    flavourMatch: number;
    orderHistoryMatch: number;
  };
  reasons: string[];
  cautions: string[];
}

export interface RecommendationResult {
  batchDate: string;
  sourceUrl: string;
  products: Product[];
  scores: ProductScore[];
  shortlist: ProductScore[];
  context: string;
}
