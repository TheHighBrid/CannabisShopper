/* CanShop evidence-first card interpretation. Pure functions; no storage or network writes. */
(() => {
  'use strict';
  const DAY = 86400000;
  const num = value => value == null || value === '' || typeof value === 'boolean' ? null :
    (Number.isFinite(Number(value)) ? Number(value) : null);
  const text = value => typeof value === 'string' ? value.trim() : '';
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const v = value.trim();
    // Accept ISO dates/timestamps and explicit named-month dates only.
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) &&
        !/^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}$/i.test(v)) return null;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(t).toISOString().slice(0,10) !== v) return null;
    return Math.floor(t / DAY);
  };
  const tag = (label, tone, reason) => ({label, tone, reason});
  const awardCodes = Object.freeze({1:'+1',2:'+2',3:'+212',4:'+57',5:'+93',last:'+213'});
  function interpret(item, options = {}) {
    const source = options.source === 'canna' ? 'canna' : 'bulk';
    const now = day(options.asOf || new Date().toISOString());
    const reviewCount = num(item.reviews);
    const rating = num(item.rating);
    const reviewValid = rating != null && rating >= 0 && rating <= 5 && Number.isInteger(reviewCount) && reviewCount > 0;
    const fetched = day(item.fetchedAt);
    const batch = day(item.batch);
    const stamps = [];
    const lines = [];
    const caveats = [];
    if (source === 'bulk') {
      if (reviewValid) {
        lines.push(rating.toFixed(2) + '/5 from ' + reviewCount + ' reported rating' + (reviewCount === 1 ? '' : 's') + '.');
        if (reviewCount < 10) {
          stamps.push(tag('SMALL SAMPLE', 'muted', 'Fewer than 10 reported ratings.'));
          caveats.push('A small review sample can change substantially.');
        } else {
          stamps.push(tag('REVIEW HISTORY', 'neutral', 'At least 10 reported ratings; independence has not been verified.'));
        }
        caveats.push('Reported customer ratings are not independent quality or safety verification.');
      } else {
        stamps.push(tag('UNDER INVESTIGATION', 'muted', 'A valid review average and count are not both available.'));
        caveats.push('Review evidence is incomplete.');
      }
      if (batch != null && now != null && batch <= now) {
        const age = now - batch;
        stamps.push(tag('BATCH DATED', 'neutral', 'Listing reports a date ' + age + ' calendar day' + (age === 1 ? '' : 's') + ' ago.'));
        lines.push('Listed batch date is ' + age + ' day' + (age === 1 ? '' : 's') + ' old.');
        caveats.push('A batch date alone does not establish freshness, storage conditions or an expiry date.');
      } else {
        caveats.push('No usable past batch date is recorded.');
      }
      const coverage = num(item.transparencyScore);
      if (coverage != null && coverage >= 0 && coverage <= 1) {
        lines.push(Math.round(coverage * 100) + '% of tracked listing fields are populated.');
        if (coverage < 0.6) stamps.push(tag('TRUST ISSUES', 'muted', 'Fewer than 60% of tracked fields are populated; this is a data coverage warning, not a quality judgment.'));
      }
      if (num(item.score) != null) caveats.push('The current comparison score depends on selected preferences and package; it is not an all-time quality rank.');
    } else {
      caveats.push('This source does not provide comparable review or batch-date evidence in the current card schema.');
      const qty = num(item.qtyAvailable);
      if (qty != null && qty >= 0) lines.push('Recorded inventory quantity: ' + Math.floor(qty) + ' at the time of the fetch.');
    }
    if (fetched != null && now != null && fetched <= now) {
      const age = now - fetched;
      lines.push('Listing observed ' + (age === 0 ? 'today' : age + ' day' + (age === 1 ? '' : 's') + ' ago') + '.');
      if (age > 7) stamps.push(tag('STALE SNAPSHOT', 'muted', 'The listing was last observed more than 7 days ago.'));
    } else {
      caveats.push('Observation timestamp is missing or invalid.');
    }
    if (num(item.thc) != null || num(item.thcMin) != null || num(item.thcMax) != null) {
      caveats.push('Reported THC describes potency, not overall quality or safety.');
    }
    return {stamps: stamps.slice(0,4), lines, caveats};
  }
  function render(item, options) {
    const result = interpret(item, options);
    const stamps = result.stamps.map(s => '<span class="cs-stamp cs-stamp--' + html(s.tone) + '">' + html(s.label) + '</span>').join('');
    const list = (values) => values.map(v => '<li>' + html(v) + '</li>').join('');
    return '<section class="cs-insights" aria-label="CanShop listing evidence">' +
      '<div class="cs-insight-label">CANSHOP / EVIDENCE NOTES</div>' +
      (stamps ? '<div class="cs-stamps">' + stamps + '</div>' : '') +
      '<p class="cs-verdict">' + html(result.lines.join(' ') || 'There is not enough comparable evidence for a detailed assessment.') + '</p>' +
      '<details class="cs-evidence"><summary>Why these notes?</summary><ul>' +
      list([...result.stamps.map(s => s.label + ': ' + s.reason), ...result.caveats]) +
      '</ul></details></section>';
  }
  globalThis.CanShopInsights = Object.freeze({interpret, render, awardCodes});
})();
