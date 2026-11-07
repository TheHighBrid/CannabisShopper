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

test('buildApiUrl generates locked Whole Flower query parameters with THC >= 29', () => {
  const urlString = buildApiUrl(1);
  const parsed = new URL(urlString);

  assert.equal(parsed.origin, 'https://app.cannacabana.com');
  assert.equal(parsed.pathname, '/api/product/filterv2');
  assert.equal(parsed.searchParams.get('collection'), 'whole-flower');
  assert.equal(parsed.searchParams.get('storeId'), '3658');
  assert.equal(parsed.searchParams.get('thc_level_min'), '29');
  assert.equal(parsed.searchParams.get('thc_level_max'), '100');
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
  assert.equal(result.item.hasElite, true);
  assert.equal(result.item.elitePrice, 98.89);
  assert.equal(result.item.price, 98.89);
  assert.equal(result.item.sizeGrams, 28);
  assert.equal(result.item.pricePerGram, 3.53);
  assert.equal(result.item.qtyAvailable, 14);
  assert.equal(result.item.source, 'Canna Cabana');
});

test('normalizeCannaProduct accepts 14g Elite products', () => {
  const product = mockProduct({
    title: 'Frost Monster',
    variantTitle: '14 g',
    equivalentGrams: '14.00',
    elitePrice: '99.29',
    thc: '30.08'
  });
  const result = normalizeCannaProduct(product);

  assert.equal(result.accepted, true);
  assert.equal(result.item.name, 'Frost Monster');
  assert.equal(result.item.sizeGrams, 14);
  assert.equal(result.item.hasElite, true);
  assert.equal(result.item.price, 99.29);
  assert.equal(result.item.pricePerGram, 7.09);
});

test('normalizeCannaProduct accepts regular strains with no elite pricing', () => {
  const product = mockProduct({
    title: 'Galactic Jack',
    variantTitle: '28 g',
    equivalentGrams: '28.00',
    elitePrice: '0.00',
    isElite: false,
    thc: '31.52'
  });
  // member_price is 122.99 from mockProduct
  const result = normalizeCannaProduct(product);

  assert.equal(result.accepted, true);
  assert.equal(result.item.name, 'Galactic Jack');
  assert.equal(result.item.hasElite, false);
  assert.equal(result.item.elitePrice, null);
  assert.equal(result.item.regularPrice, 122.99);
  assert.equal(result.item.price, 122.99);
  assert.equal(result.item.priceType, 'Regular');
  assert.equal(result.item.sizeGrams, 28);
  assert.equal(result.item.pricePerGram, 4.39);
});

test('normalizeCannaProduct accepts valid Elite products when is_elite is false but elite_price > 0 and store 3658 eligible', () => {
  const product = mockProduct({
    title: "Chopper's Pick Smalls",
    isElite: false,
    elitePrice: '111.17',
    eliteStores: '5795,4423,3658,8060'
  });
  const result = normalizeCannaProduct(product);

  assert.equal(result.accepted, true);
  assert.equal(result.item.name, "Chopper's Pick Smalls");
  assert.equal(result.item.hasElite, true);
  assert.equal(result.item.elitePrice, 111.17);
  assert.equal(result.item.pricePerGram, 3.97);
});

test('normalizeCannaProduct rejects products outside 14g to 28g range', () => {
  const tooSmall = mockProduct({ variantTitle: '3.5 g', equivalentGrams: '3.50' });
  assert.equal(normalizeCannaProduct(tooSmall).accepted, false);
  assert.equal(normalizeCannaProduct(tooSmall).reason, 'wrong-size');

  const sevenGrams = mockProduct({ variantTitle: '7 g', equivalentGrams: '7.00' });
  assert.equal(normalizeCannaProduct(sevenGrams).accepted, false);
  assert.equal(normalizeCannaProduct(sevenGrams).reason, 'wrong-size');
});

test('normalizeCannaProduct accepts intermediate sizes between 14g and 28g (e.g. 15g)', () => {
  const fifteenGrams = mockProduct({
    title: 'Good Supply Sativa',
    variantTitle: '15 g',
    equivalentGrams: '15.00',
    thc: '29.50',
    elitePrice: '60.00'
  });
  const result = normalizeCannaProduct(fifteenGrams);
  assert.equal(result.accepted, true);
  assert.equal(result.item.sizeGrams, 15);
  assert.equal(result.item.pricePerGram, 4.00);
});

test('normalizeCannaProduct rejects products with THC below 29%', () => {
  const tooLow = mockProduct({ thc: '25.50' });
  assert.equal(normalizeCannaProduct(tooLow).accepted, false);
  assert.equal(normalizeCannaProduct(tooLow).reason, 'thc');
});

test('normalizeCannaProduct accepts high THC above 29% without artificial cap', () => {
  const highThc = mockProduct({ thc: '38.00' });
  assert.equal(normalizeCannaProduct(highThc).accepted, true);
  assert.equal(highThc.variants[0].pricing.thc_level, '38.00');
});

test('normalizeCannaProduct treats non-elite store price as regular price', () => {
  const otherStores = mockProduct({
    eliteStores: '1234,5678,9999',
    elitePrice: '80.00'
  });
  const result = normalizeCannaProduct(otherStores);

  assert.equal(result.accepted, true);
  assert.equal(result.item.hasElite, false);
  assert.equal(result.item.price, 122.99); // member price
  assert.equal(result.item.priceType, 'Regular');
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
