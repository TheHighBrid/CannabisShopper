import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Setup minimal DOM/window mocks before loading cannacabana.js
global.window = {
  addEventListener: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
global.document = {
  querySelector: () => null
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

// Evaluate cannacabana.js
const code = readFileSync(resolve('app/src/main/assets/cannacabana.js'), 'utf8');
new Function(code)();

const {
  buildApiUrl,
  normalizeCannaProduct,
  choose28gVariant,
  getStrainType,
  storeHasElitePrice
} = window.CanShopCanna;

function mockProduct({
  title = 'East Coast Flamingo',
  handle = 'org-east-coast-flamingo',
  vendor = "Big Bag O' Buds",
  tags = ['Flower', 'lineage:sativa', 'Whole Flower'],
  variantTitle = '28 g',
  equivalentGrams = '28.00',
  thc = '31.80',
  cbd = '0.94',
  elitePrice = '98.89',
  isElite = true,
  eliteStores = '8360,3658,3166',
  qty = '14.000'
} = {}) {
  return {
    id: 123456,
    title,
    handle,
    vendor,
    tags,
    variants: [
      {
        id: 98765,
        sku: 'SKU123',
        title: variantTitle,
        pricing: {
          storeId: 641,
          retail_price: '122.99',
          member_price: '122.99',
          elite_price: elitePrice,
          is_elite: isElite,
          elite_stores: eliteStores,
          qty_available: qty,
          equivalent_g: equivalentGrams,
          thc_level: thc,
          cbd_level: cbd
        }
      }
    ]
  };
}

test('buildApiUrl generates locked Whole Flower and Elite query parameters', () => {
  const urlString = buildApiUrl(1);
  const parsed = new URL(urlString);

  assert.equal(parsed.origin, 'https://app.cannacabana.com');
  assert.equal(parsed.pathname, '/api/product/filterv2');
  assert.equal(parsed.searchParams.get('collection'), 'whole-flower');
  assert.equal(parsed.searchParams.get('selectedOptions'), '28 G');
  assert.equal(parsed.searchParams.get('storeId'), '3658');
  assert.equal(parsed.searchParams.get('priceType'), 'elite_price');
  assert.equal(parsed.searchParams.get('thc_level_min'), '29.97');
  assert.equal(parsed.searchParams.get('thc_level_max'), '34.97');
  assert.equal(parsed.searchParams.get('page'), '1');
  assert.equal(parsed.searchParams.get('limit'), '100');
  assert.equal(parsed.searchParams.get('sortOrder'), 'asc');
  assert.equal(parsed.searchParams.get('sortField'), 'title');
});

test('normalizeCannaProduct accepts valid 28g Elite products with is_elite: true', () => {
  const product = mockProduct();
  const result = normalizeCannaProduct(product);

  assert.equal(result.accepted, true);
  assert.equal(result.item.name, 'East Coast Flamingo');
  assert.equal(result.item.strainType, 'Sativa');
  assert.equal(result.item.thc, 31.8);
  assert.equal(result.item.elitePrice, 98.89);
  assert.equal(result.item.sizeGrams, 28);
  assert.equal(result.item.pricePerGram, 3.53);
  assert.equal(result.item.qtyAvailable, 14);
  assert.equal(result.item.source, 'Canna Cabana');
});

test('normalizeCannaProduct accepts valid Elite products when is_elite is false but elite_price > 0 and store 3658 eligible', () => {
  // Flash sale or special elite listings often return is_elite: false from Canna Cabana API
  const product = mockProduct({
    title: "Chopper's Pick Smalls",
    isElite: false,
    elitePrice: '111.17',
    eliteStores: '5795,4423,3658,8060'
  });
  const result = normalizeCannaProduct(product);

  assert.equal(result.accepted, true);
  assert.equal(result.item.name, "Chopper's Pick Smalls");
  assert.equal(result.item.elitePrice, 111.17);
  assert.equal(result.item.pricePerGram, 3.97);
});

test('normalizeCannaProduct rejects products without 28g variant', () => {
  const product = mockProduct({ variantTitle: '3.5 g', equivalentGrams: '3.50' });
  const result = normalizeCannaProduct(product);

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'wrong-size');
});

test('normalizeCannaProduct rejects products with THC outside 29.97% - 34.97%', () => {
  const tooLow = mockProduct({ thc: '25.50' });
  assert.equal(normalizeCannaProduct(tooLow).accepted, false);
  assert.equal(normalizeCannaProduct(tooLow).reason, 'thc');

  const tooHigh = mockProduct({ thc: '38.00' });
  assert.equal(normalizeCannaProduct(tooHigh).accepted, false);
  assert.equal(normalizeCannaProduct(tooHigh).reason, 'thc');
});

test('normalizeCannaProduct rejects products without positive Elite price', () => {
  const zeroElite = mockProduct({ elitePrice: '0.00' });
  assert.equal(normalizeCannaProduct(zeroElite).accepted, false);
  assert.equal(normalizeCannaProduct(zeroElite).reason, 'no-elite-price');

  const nullElite = mockProduct({ elitePrice: null });
  assert.equal(normalizeCannaProduct(nullElite).accepted, false);
  assert.equal(normalizeCannaProduct(nullElite).reason, 'no-elite-price');
});

test('normalizeCannaProduct rejects products when store 3658 is not in elite_stores', () => {
  const otherStores = mockProduct({ eliteStores: '1234,5678,9999' });
  const result = normalizeCannaProduct(otherStores);

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'no-elite-price');
});

test('normalizeCannaProduct rejects out-of-stock products', () => {
  const soldOut = mockProduct({ qty: '0.000' });
  const result = normalizeCannaProduct(soldOut);

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'out-of-stock');
});

test('getStrainType parses lineage tags and fallback tags correctly', () => {
  assert.equal(getStrainType({ tags: ['lineage:indica'] }), 'Indica');
  assert.equal(getStrainType({ tags: ['lineage:sativa'] }), 'Sativa');
  assert.equal(getStrainType({ tags: ['lineage:hybrid'] }), 'Hybrid');
  assert.equal(getStrainType({ tags: ['Hybrid', 'Flower'] }), 'Hybrid');
  assert.equal(getStrainType({ tags: ['Flower'] }), 'Unknown');
});
