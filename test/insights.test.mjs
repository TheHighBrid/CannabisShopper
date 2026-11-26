import assert from 'node:assert/strict';
import test from 'node:test';
import '../app/src/main/assets/insights.js';
const { interpret, render, awardCodes } = globalThis.CanShopInsights;
const asOf = '2026-11-24';
test('review context distinguishes a small sample from a high rating', () => {
  const result = interpret({rating:5,reviews:2,transparencyScore:0.8}, {asOf});
  assert.ok(result.stamps.some(s => s.label === 'SMALL SAMPLE'));
  assert.ok(result.caveats.some(s => s.includes('small review sample')));
});
test('batch date interpretation does not imply freshness or expiry', () => {
  const result = interpret({batch:'2026-11-01',rating:4.5,reviews:20}, {asOf});
  assert.ok(result.lines.some(s => s.includes('23 days')));
  assert.ok(result.caveats.some(s => s.includes('storage conditions')));
});
test('missing, future or invalid dates never create a dated stamp', () => {
  for (const batch of [null,'unknown','2026-11-25','2026-02-31']) {
    assert.ok(!interpret({batch},{asOf}).stamps.some(s => s.label === 'BATCH DATED'));
  }
});
test('source-specific schema does not invent reviews or batch data', () => {
  const result = interpret({qtyAvailable:4,thc:30,fetchedAt:'2026-11-20'}, {source:'canna',asOf});
  assert.ok(result.lines.some(s=>s.includes('quantity: 4')));
  assert.ok(result.caveats.some(s=>s.includes('does not provide comparable review')));
  assert.ok(!result.stamps.some(s=>s.label==='REVIEW HISTORY'));
});
test('future timestamps do not produce an observation age', () => {
  const result=interpret({fetchedAt:'2026-11-25'},{asOf});
  assert.ok(result.caveats.some(s=>s.includes('timestamp is missing or invalid')));
});
test('false, blank and out-of-range ratings are not accepted as evidence', () => {
  for (const rating of [null,'',false,8,-1]) {
    assert.ok(interpret({rating,reviews:20},{asOf}).stamps.some(s=>s.label==='UNDER INVESTIGATION'));
  }
});
test('stale and incomplete evidence appears without mutating original product', () => {
  const item=Object.freeze({fetchedAt:'2026-11-01',transparencyScore:0.4});
  const result=interpret(item,{asOf});
  assert.ok(result.stamps.some(s=>s.label==='STALE SNAPSHOT'));
  assert.ok(result.stamps.some(s=>s.label==='TRUST ISSUES'));
});
test('render uses native expandable evidence details and no fake global rank', () => {
  const output=render({rating:4.5,reviews:20},{asOf});
  assert.match(output,/<details class="cs-evidence">/);
  assert.doesNotMatch(output,/\+212|\+213|THE GOAT/);
  assert.deepEqual(awardCodes,{1:'+1',2:'+2',3:'+212',4:'+57',5:'+93',last:'+213'});
});
