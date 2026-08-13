import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecommendationResult, formatRecommendation } from '../dist/output.js';
import { scoreProducts } from '../dist/scoring.js';
import { parseProducts } from '../dist/scraper.js';

function listingCard({ name = 'Craft Citrus 1 oz', thc = '27', rating = '4.7', reviews = '24' } = {}) {
  return `<li class="product type-product">
    <a href="/product/craft-citrus"><h2 class="woocommerce-loop-product__title">${name}</h2></a>
    <span class="price"><del>$180.00</del><ins>$150.00</ins></span>
    <span>THC: ${thc}% CBD: 1% Flavours: citrus, pine.</span>
    <span itemprop="ratingValue" content="${rating}"></span>
    <span itemprop="reviewCount" content="${reviews}"></span>
    <button class="add_to_cart_button">Add to cart</button>
  </li>`;
}

test('parses regular price and derives normalized price per gram', () => {
  const [product] = parseProducts(`<ul>${listingCard()}</ul>`, 'https://www.bulkbuddy.co/');
  assert.equal(product.price.value, 180);
  assert.equal(product.packageSizeGrams.value, 28.35);
  assert.equal(product.pricePerGram.value, 6.35);
  assert.equal(product.reviewRating.value, 4.7);
  assert.equal(product.availability.status, 'present');
});

test('rejects impossible percentage and rating values instead of scoring them', () => {
  const [product] = parseProducts(listingCard({ thc: '127', rating: '8.4' }));
  assert.equal(product.thcPercent.value, null);
  assert.equal(product.reviewRating.value, null);
  assert.ok(product.missingFields.includes('thcPercent'));
  assert.ok(product.missingFields.includes('reviewRating'));
});

test('excludes non-flower formats and non-craft listings', () => {
  const html = listingCard({ name: 'Craft Citrus Hash 1 oz' }) + listingCard({ name: 'Citrus Flower 1 oz' });
  assert.deepEqual(parseProducts(html), []);
});

test('scores products without allowing unavailable items onto the shortlist', () => {
  const products = parseProducts(listingCard());
  products[0].availability = { value: null, status: 'unavailable', note: 'Sold out' };
  const scores = scoreProducts(products, { targetThcPercent: 27, preferredFlavours: ['citrus'] });
  const result = buildRecommendationResult('https://example.test', products, scores);
  assert.equal(scores.length, 1);
  assert.equal(result.shortlist.length, 0);
  assert.ok(scores[0].total >= 0 && scores[0].total <= 100);
  assert.ok(scores[0].cautions.some(caution => caution.includes('explicitly unavailable')));
});

test('penalizes unavailable listings and uses product name as a deterministic tie-breaker', () => {
  const products = parseProducts(
    listingCard({ name: 'Craft Zebra 1 oz' }) + listingCard({ name: 'Craft Alpha 1 oz' })
  );
  const availableScore = scoreProducts([products[0]])[0].total;
  products[0].availability = { value: null, status: 'unavailable', note: 'Sold out' };

  const scores = scoreProducts(products);

  assert.equal(scores[0].product.name.value, 'Craft Alpha 1 oz');
  assert.ok(scores[1].total <= availableScore - 25);
});

test('keeps scraped line breaks from corrupting markdown output', () => {
  const products = parseProducts(listingCard({ name: 'Craft Citrus 1 oz' }));
  products[0].name.value = 'Craft Citrus\nInjected heading';
  const scores = scoreProducts(products);
  const output = formatRecommendation(buildRecommendationResult('https://example.test', products, scores));
  assert.match(output, /Craft Citrus Injected heading/);
  assert.doesNotMatch(output, /Craft Citrus\nInjected heading/);
});

test('escapes embedded HTML from listing text in markdown output', () => {
  const products = parseProducts(listingCard());
  products[0].name.value = 'Craft <script>alert(1)</script> & Citrus';
  const scores = scoreProducts(products);
  const output = formatRecommendation(buildRecommendationResult('https://example.test', products, scores));

  assert.doesNotMatch(output, /<script>/);
  assert.match(output, /Craft &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Citrus/);
});
