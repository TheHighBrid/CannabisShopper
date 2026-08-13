(() => {
  'use strict';

  const STORAGE_KEY = 'canshop.products.v3';
  const LEGACY_STORAGE_KEYS = ['canshop.products.v2', 'canshop.products.v1'];
  const PREFS_KEY = 'canshop.preferences.v3';
  const LEGACY_PREFS_KEYS = ['canshop.preferences.v2', 'canshop.preferences.v1'];
  const AGE_KEY = 'canshop.legalAgeConfirmed.v1';

  const ORIGIN = 'https://www.bulkbuddy.co';
  const SEARCH_URL = `${ORIGIN}/?term=craft-cannabis-flowers&s=&post_type=product&taxonomy=product_cat`;
  const CRAFT_CATEGORY_URL = `${ORIGIN}/product-category/cannabis/craft-cannabis-flowers/?shop_view=list_view&per_page=200`;
  const DISCOVERY_SEEDS = [
    SEARCH_URL,
    CRAFT_CATEGORY_URL,
    `${ORIGIN}/product-category/cannabis/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/aaaa/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/indica/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/hybrid/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/sativa/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/`
  ];

  const EXCLUDED_TERMS = [
    'kief', 'hash', 'pre-roll', 'preroll', 'edible', 'gummy', 'vape', 'cartridge',
    'extract', 'concentrate', 'shatter', 'rosin', 'resin', 'cbd candy', 'shake', 'trim'
  ];
  const PACKAGE_GRAMS = { ounce: 28.3495, quarterPound: 113.398 };
  const MAX_DISCOVERY_PAGES = 28;
  const MAX_PRODUCT_PAGES = 180;
  const REQUEST_ATTEMPTS = 3;
  const pendingRequests = new Map();

  const els = {
    ageGate: document.querySelector('#ageGate'),
    confirmAge: document.querySelector('#confirmAge'),
    declineAge: document.querySelector('#declineAge'),
    refreshButton: document.querySelector('#refreshButton'),
    fetchButton: document.querySelector('#fetchButton'),
    addProductButton: document.querySelector('#addProductButton'),
    clearButton: document.querySelector('#clearButton'),
    status: document.querySelector('#status'),
    metricCount: document.querySelector('#metricCount'),
    metricBest: document.querySelector('#metricBest'),
    metricValue: document.querySelector('#metricValue'),
    toggleSettings: document.querySelector('#toggleSettings'),
    settingsForm: document.querySelector('#settingsForm'),
    targetThc: document.querySelector('#targetThc'),
    maxPricePerGram: document.querySelector('#maxPricePerGram'),
    preferredFlavours: document.querySelector('#preferredFlavours'),
    availableOnly: document.querySelector('#availableOnly'),
    comparisonPackage: document.querySelector('#comparisonPackage'),
    resultSearch: document.querySelector('#resultSearch'),
    resultSort: document.querySelector('#resultSort'),
    resultSummary: document.querySelector('#resultSummary'),
    resetSearch: document.querySelector('#resetSearch'),
    results: document.querySelector('#results'),
    emptyState: document.querySelector('#emptyState'),
    noMatchesState: document.querySelector('#noMatchesState'),
    productDialog: document.querySelector('#productDialog'),
    closeDialog: document.querySelector('#closeDialog'),
    productForm: document.querySelector('#productForm'),
    productName: document.querySelector('#productName'),
    productOneOuncePrice: document.querySelector('#productOneOuncePrice'),
    productQuarterPoundPrice: document.querySelector('#productQuarterPoundPrice'),
    productThcMin: document.querySelector('#productThcMin'),
    productThcMax: document.querySelector('#productThcMax'),
    productCbd: document.querySelector('#productCbd'),
    productRating: document.querySelector('#productRating'),
    productReviews: document.querySelector('#productReviews'),
    productTerpenes: document.querySelector('#productTerpenes'),
    productType: document.querySelector('#productType'),
    productBatch: document.querySelector('#productBatch'),
    productAvailable: document.querySelector('#productAvailable')
  };

  const defaultPreferences = {
    targetThc: 27,
    maxPricePerGram: 8,
    preferredFlavours: ['citrus', 'gas', 'pine', 'berry', 'diesel'],
    availableOnly: true,
    comparisonPackage: 'quarterPound'
  };

  let products = readWithMigration(STORAGE_KEY, LEGACY_STORAGE_KEYS, []);
  let preferences = {
    ...defaultPreferences,
    ...readWithMigration(PREFS_KEY, LEGACY_PREFS_KEYS, defaultPreferences)
  };
  let isFetching = false;
  let resultQuery = '';
  let resultSort = 'score';

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function readWithMigration(key, legacyKeys, fallback) {
    const current = readJson(key, null);
    if (current != null) return current;
    for (const legacyKey of legacyKeys) {
      const legacy = readJson(legacyKey, null);
      if (legacy != null) {
        localStorage.setItem(key, JSON.stringify(legacy));
        return legacy;
      }
    }
    return fallback;
  }

  function writeState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  }

  function numberOrNull(value) {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function round(value, places = 2) {
    const power = 10 ** places;
    return Math.round(value * power) / power;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sleep(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function normalizeText(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle('error', isError);
  }

  function setFetching(value) {
    isFetching = value;
    els.refreshButton.disabled = value;
    els.fetchButton.disabled = value;
    els.fetchButton.textContent = value ? 'Fetching every strain…' : 'Fetch Bulk Buddy strains';
  }

  function average(min, max) {
    if (min == null && max == null) return null;
    if (min == null) return max;
    if (max == null) return min;
    return round((min + max) / 2, 2);
  }

  function formatRange(min, max, suffix = '') {
    if (min == null && max == null) return '';
    if (min == null || max == null || min === max) return `${min ?? max}${suffix}`;
    return `${min} – ${max}${suffix}`;
  }

  function normalizeProduct(input) {
    const oneOuncePrice = numberOrNull(input.oneOuncePrice ?? input.price);
    const quarterPoundPrice = numberOrNull(input.quarterPoundPrice);
    const thcMin = numberOrNull(input.thcMin ?? input.thc);
    const thcMax = numberOrNull(input.thcMax ?? input.thc);
    const selectedPackage = preferences.comparisonPackage === 'ounce' ? 'ounce' : 'quarterPound';
    const comparisonPrice = selectedPackage === 'ounce'
      ? oneOuncePrice
      : (quarterPoundPrice ?? oneOuncePrice);
    const comparisonGrams = selectedPackage === 'ounce' || quarterPoundPrice == null
      ? PACKAGE_GRAMS.ounce
      : PACKAGE_GRAMS.quarterPound;

    return {
      id: input.id || input.sourceUrl || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: normalizeText(input.name || 'Untitled craft flower'),
      strainType: normalizeText(input.strainType || input.type || 'Unknown'),
      rating: numberOrNull(input.rating),
      reviews: numberOrNull(input.reviews),
      flavours: normalizeText(input.flavours || input.terpenes || ''),
      thcMin,
      thcMax,
      thcDisplay: normalizeText(input.thcDisplay || formatRange(thcMin, thcMax, '%')),
      cbdDisplay: normalizeText(input.cbdDisplay || input.cbd || ''),
      batch: normalizeText(input.batch || ''),
      oneOuncePrice,
      quarterPoundPrice,
      oneOunceRegularPrice: numberOrNull(input.oneOunceRegularPrice),
      quarterPoundRegularPrice: numberOrNull(input.quarterPoundRegularPrice),
      comparisonPrice,
      comparisonGrams,
      pricePerGram: comparisonPrice != null ? round(comparisonPrice / comparisonGrams) : null,
      available: input.available !== false,
      source: input.source || 'manual',
      sourceUrl: input.sourceUrl || null,
      fetchedAt: input.fetchedAt || null
    };
  }

  function isAllowedFlower(product) {
    const haystack = `${product.name} ${product.flavours}`.toLowerCase();
    return /craft/i.test(product.name) && !EXCLUDED_TERMS.some(term => haystack.includes(term));
  }

  function transparency(product) {
    const checks = [
      product.oneOuncePrice,
      product.quarterPoundPrice,
      product.thcMin,
      product.thcMax,
      product.cbdDisplay,
      product.rating,
      product.reviews,
      product.flavours,
      product.batch,
      product.strainType
    ];
    return checks.filter(value => value !== null && value !== '').length / checks.length;
  }

  function scoreProduct(product, range) {
    const reasons = [];
    const cautions = [];
    let valueScore = 0.25;

    if (product.pricePerGram != null && range.min != null && range.max != null) {
      valueScore = range.min === range.max
        ? 0.8
        : clamp(1 - ((product.pricePerGram - range.min) / (range.max - range.min)), 0.1, 1);
      reasons.push(`${preferences.comparisonPackage === 'ounce' ? 'One-ounce' : 'Quarter-pound'} value is $${product.pricePerGram.toFixed(2)}/g.`);
      if (preferences.maxPricePerGram && product.pricePerGram > preferences.maxPricePerGram) {
        valueScore *= 0.65;
        cautions.push('Above your maximum price-per-gram preference.');
      }
    } else {
      cautions.push(`The ${preferences.comparisonPackage === 'ounce' ? 'one-ounce' : 'quarter-pound'} price was not found.`);
    }

    const transparencyScore = transparency(product);
    if (transparencyScore >= 0.8) reasons.push('Product page supplied nearly every requested field.');
    if (transparencyScore < 0.6) cautions.push('Several requested product-page fields are missing.');

    let reviewScore = 0.25;
    if (product.rating != null && product.reviews != null) {
      const quality = clamp(product.rating / 5, 0, 1);
      const volume = Math.min(1, Math.log10(product.reviews + 1) / 2.4);
      reviewScore = quality * 0.72 + volume * 0.28;
      reasons.push(`${product.rating.toFixed(2)}/5 from ${product.reviews} ratings.`);
    } else {
      cautions.push('Rating or review count is missing.');
    }

    let flavourScore = 0.35;
    const flavourText = product.flavours.toLowerCase();
    const matches = preferences.preferredFlavours.filter(word => flavourText.includes(word.toLowerCase()));
    if (!flavourText) {
      flavourScore = 0.2;
      cautions.push('Flavour information is missing.');
    } else if (matches.length) {
      flavourScore = clamp(0.55 + matches.length * 0.12, 0, 1);
      reasons.push(`Flavour match: ${matches.join(', ')}.`);
    }

    let potencyScore = 0.25;
    const thcAverage = average(product.thcMin, product.thcMax);
    if (thcAverage != null) {
      potencyScore = 0.65;
      if (preferences.targetThc != null) {
        potencyScore += Math.max(0, 0.3 - Math.abs(thcAverage - preferences.targetThc) / 50);
      }
    } else {
      cautions.push('THC range is missing.');
    }

    let total =
      valueScore * 30 +
      transparencyScore * 25 +
      reviewScore * 20 +
      flavourScore * 15 +
      clamp(potencyScore, 0, 1) * 10;

    if (!product.available) total -= 25;

    return {
      ...product,
      score: round(clamp(total, 0, 100), 1),
      transparencyScore,
      reasons,
      cautions
    };
  }

  function getRankedProducts() {
    const eligible = products
      .map(normalizeProduct)
      .filter(isAllowedFlower)
      .filter(product => !preferences.availableOnly || product.available);
    const prices = eligible.map(product => product.pricePerGram).filter(value => value != null);
    const range = {
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null
    };
    return eligible
      .map(product => scoreProduct(product, range))
      .sort((a, b) => b.score - a.score || (a.pricePerGram ?? Infinity) - (b.pricePerGram ?? Infinity));
  }

  function formatMoney(value) {
    return value == null
      ? 'Not found'
      : new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
        maximumFractionDigits: 2
      }).format(value);
  }

  function packagePriceHtml(label, price, grams) {
    const ppg = price == null ? null : price / grams;
    return `<div class="package-price">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatMoney(price))}</strong>
      <small>${ppg == null ? 'price unavailable' : `$${ppg.toFixed(2)}/g`}</small>
    </div>`;
  }

  function render() {
    const ranked = getRankedProducts();
    const normalizedQuery = resultQuery.trim().toLowerCase();
    const visible = ranked.filter(item => {
      if (!normalizedQuery) return true;
      return `${item.name} ${item.strainType} ${item.flavours}`.toLowerCase().includes(normalizedQuery);
    }).sort((a, b) => {
      if (resultSort === 'price') return (a.pricePerGram ?? Infinity) - (b.pricePerGram ?? Infinity);
      if (resultSort === 'thc') return (average(b.thcMin, b.thcMax) ?? -1) - (average(a.thcMin, a.thcMax) ?? -1);
      if (resultSort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1) || (b.reviews ?? 0) - (a.reviews ?? 0);
      if (resultSort === 'name') return a.name.localeCompare(b.name, 'en-CA', { sensitivity: 'base' });
      return b.score - a.score || (a.pricePerGram ?? Infinity) - (b.pricePerGram ?? Infinity);
    });
    const hasProducts = ranked.length > 0;
    els.emptyState.hidden = hasProducts;
    els.noMatchesState.hidden = !hasProducts || visible.length > 0;
    els.results.hidden = visible.length === 0;
    els.resultSummary.hidden = !hasProducts;
    els.resultSummary.textContent = normalizedQuery
      ? `Showing ${visible.length} of ${ranked.length} saved strain${ranked.length === 1 ? '' : 's'}`
      : `${ranked.length} saved strain${ranked.length === 1 ? '' : 's'}`;
    els.metricCount.textContent = String(ranked.length);
    els.metricBest.textContent = ranked.length ? String(ranked[0].score) : '—';
    const validValues = ranked.map(item => item.pricePerGram).filter(value => value != null);
    els.metricValue.textContent = validValues.length ? `$${Math.min(...validValues).toFixed(2)}` : '—';

    els.results.innerHTML = visible.map((item, index) => {
      const explanation = item.reasons.slice(0, 2).join(' ') || 'Ranked from the fields extracted from the product page.';
      const warning = item.cautions.length ? ` Watch-out: ${item.cautions[0]}` : '';
      return `
        <article class="result-card">
          <div class="result-top">
            <div class="rank">${index + 1}</div>
            <div class="result-name">
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.strainType)} · ${item.available ? 'not marked sold out' : 'out of stock'}</p>
            </div>
            <div class="score">${item.score}<small>/100</small></div>
          </div>
          <div class="product-facts">
            <div><span>Rating</span><strong>${item.rating == null ? 'Not found' : item.rating.toFixed(2)}</strong><small>${item.reviews == null ? 'count unavailable' : `${item.reviews} ratings`}</small></div>
            <div><span>Potency</span><strong>${escapeHtml(item.thcDisplay || 'Not found')}</strong><small>CBD ${escapeHtml(item.cbdDisplay || 'Not found')}</small></div>
            <div><span>Batch</span><strong>${escapeHtml(item.batch || 'Not found')}</strong><small>page listing</small></div>
            <div><span>Type</span><strong>${escapeHtml(item.strainType || 'Unknown')}</strong><small>title or category</small></div>
          </div>
          <p class="flavour-line"><strong>Flavour:</strong> ${escapeHtml(item.flavours || 'Not found')}</p>
          <div class="package-prices">
            ${packagePriceHtml('1 Ounce', item.oneOuncePrice, PACKAGE_GRAMS.ounce)}
            ${packagePriceHtml('Quarter Pound', item.quarterPoundPrice, PACKAGE_GRAMS.quarterPound)}
          </div>
          <p class="reason">${escapeHtml(explanation + warning)}</p>
          <div class="card-actions">
            <span class="source-label">${escapeHtml(item.source)}</span>
            <button class="remove" data-remove="${escapeHtml(item.id)}">Remove</button>
          </div>
        </article>`;
    }).join('');

    els.results.querySelectorAll('[data-remove]').forEach(button => {
      button.addEventListener('click', () => {
        products = products.filter(product => product.id !== button.dataset.remove);
        writeState();
        render();
        setStatus('Product removed from the local comparison notebook.');
      });
    });
  }

  function requestBulkBuddyPage(url) {
    return new Promise((resolve, reject) => {
      if (!window.Android || typeof window.Android.fetchBulkBuddyPage !== 'function') {
        reject(new Error('Website fetching is available inside the Android app.'));
        return;
      }
      const requestId = `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const timeout = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('The website request timed out.'));
      }, 55_000);
      pendingRequests.set(requestId, {
        resolve(payload) {
          window.clearTimeout(timeout);
          resolve(payload);
        },
        reject(error) {
          window.clearTimeout(timeout);
          reject(error);
        }
      });
      window.Android.fetchBulkBuddyPage(requestId, url);
    });
  }

  async function requestWithRetry(url, attempts = REQUEST_ATTEMPTS) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await requestBulkBuddyPage(url);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await sleep(650 * attempt);
      }
    }
    throw lastError || new Error('Unable to fetch the page.');
  }

  function isBulkBuddyProductUrl(url) {
    try {
      const parsed = new URL(url);
      return ['bulkbuddy.co', 'www.bulkbuddy.co'].includes(parsed.hostname.toLowerCase())
        && parsed.pathname.startsWith('/product/');
    } catch {
      return false;
    }
  }

  function canonicalUrl(value) {
    const url = new URL(value);
    url.hash = '';
    ['add-to-cart', 'orderby', 'paged'].forEach(key => url.searchParams.delete(key));
    return url.href;
  }

  function isDiscoveryPageUrl(value) {
    try {
      const url = new URL(value);
      if (!['bulkbuddy.co', 'www.bulkbuddy.co'].includes(url.hostname.toLowerCase())) return false;
      const path = url.pathname.toLowerCase();
      const category = path.startsWith('/product-category/cannabis');
      const home = path === '/';
      const search = home && url.searchParams.get('post_type') === 'product';
      return category || home || search;
    } catch {
      return false;
    }
  }

  function discoverLinks(html, baseUrl) {
    const documentFromHtml = new DOMParser().parseFromString(html, 'text/html');
    const productLinks = new Set();
    const paginationLinks = new Set();
    const anchors = [...documentFromHtml.querySelectorAll('a[href*="/product/"]')];

    for (const anchor of anchors) {
      try {
        const url = new URL(anchor.getAttribute('href'), baseUrl);
        url.hash = '';
        if (!isBulkBuddyProductUrl(url.href)) continue;
        const card = anchor.closest('li.product, .type-product, article.product, .product-grid-item, .product-wrapper');
        const context = normalizeText(`${anchor.textContent || ''} ${card?.textContent || ''} ${url.pathname}`);
        if (/\bcraft\b/i.test(context)) productLinks.add(canonicalUrl(url.href));
      } catch {
        // Ignore malformed links.
      }
    }

    const pageAnchors = documentFromHtml.querySelectorAll(
      '.woocommerce-pagination a[href], a.page-numbers[href], a.next[href], .pagination a[href]'
    );
    for (const anchor of pageAnchors) {
      try {
        const url = new URL(anchor.getAttribute('href'), baseUrl);
        if (isDiscoveryPageUrl(url.href)) paginationLinks.add(canonicalUrl(url.href));
      } catch {
        // Ignore malformed links.
      }
    }

    return { productLinks: [...productLinks], paginationLinks: [...paginationLinks] };
  }

  function parseNumber(text, regex) {
    const match = String(text).match(regex);
    if (!match) return null;
    const value = Number(match[1].replaceAll(',', ''));
    return Number.isFinite(value) ? value : null;
  }

  function parseLabelValue(text, label, stopLabels) {
    const escapedStops = stopLabels.join('|');
    const regex = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${escapedStops})\\s*:|$)`, 'i');
    return normalizeText(text.match(regex)?.[1] || '');
  }

  function decodeHtmlEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }

  function normalizeVariationLabel(value) {
    return decodeURIComponent(String(value || ''))
      .toLowerCase()
      .replaceAll('_', '-')
      .replace(/[^a-z0-9]+/g, '-');
  }

  function variationMatches(label, packageKey) {
    if (packageKey === 'ounce') {
      return /(^|-)1(-)?ounce($|-)|(^|-)one-ounce($|-)|(^|-)1-oz($|-)/.test(label)
        && !/quarter|half|3-ounce|three-ounce/.test(label);
    }
    return /quarter-pound|1-4-pound|one-quarter-pound|(^|-)qp($|-)/.test(label);
  }

  function extractVariationPrices(documentFromHtml, html) {
    const result = {
      oneOuncePrice: null,
      quarterPoundPrice: null,
      oneOunceRegularPrice: null,
      quarterPoundRegularPrice: null
    };
    const variationArrays = [];

    for (const form of documentFromHtml.querySelectorAll('form.variations_form[data-product_variations]')) {
      const raw = form.getAttribute('data-product_variations');
      if (!raw || raw === 'false') continue;
      for (const candidate of [raw, decodeHtmlEntities(raw)]) {
        try {
          const parsed = JSON.parse(candidate);
          if (Array.isArray(parsed)) variationArrays.push(parsed);
          break;
        } catch {
          // Try the decoded candidate.
        }
      }
    }

    for (const match of html.matchAll(/data-product_variations=(?:"([^"]+)"|'([^']+)')/gi)) {
      try {
        const parsed = JSON.parse(decodeHtmlEntities(match[1] || match[2] || ''));
        if (Array.isArray(parsed)) variationArrays.push(parsed);
      } catch {
        // Ignore malformed payloads.
      }
    }

    for (const variations of variationArrays) {
      for (const variation of variations) {
        if (!variation || variation.is_in_stock === false || variation.is_purchasable === false) continue;
        const label = normalizeVariationLabel(Object.values(variation.attributes || {}).join(' '));
        const current = numberOrNull(variation.display_price ?? variation.price);
        const regular = numberOrNull(variation.display_regular_price ?? variation.regular_price);
        if (variationMatches(label, 'ounce')) {
          result.oneOuncePrice = current ?? result.oneOuncePrice;
          result.oneOunceRegularPrice = regular ?? result.oneOunceRegularPrice;
        }
        if (variationMatches(label, 'quarterPound')) {
          result.quarterPoundPrice = current ?? result.quarterPoundPrice;
          result.quarterPoundRegularPrice = regular ?? result.quarterPoundRegularPrice;
        }
      }
    }

    const decodedHtml = decodeHtmlEntities(html);
    for (const match of decodedHtml.matchAll(/\{[^{}]{0,1600}"display_price"\s*:\s*([0-9.]+)[^{}]{0,1600}"attributes"\s*:\s*\{([^{}]+)\}[^{}]{0,600}\}/gi)) {
      const label = normalizeVariationLabel(match[2]);
      const price = numberOrNull(match[1]);
      if (variationMatches(label, 'ounce') && result.oneOuncePrice == null) result.oneOuncePrice = price;
      if (variationMatches(label, 'quarterPound') && result.quarterPoundPrice == null) result.quarterPoundPrice = price;
    }

    return result;
  }

  function parseProductPage(html, sourceUrl) {
    const documentFromHtml = new DOMParser().parseFromString(html, 'text/html');
    const bodyText = normalizeText(documentFromHtml.body?.textContent || '');
    const summaryText = normalizeText(
      documentFromHtml.querySelector('.summary, .product-summary-wrap, .entry-summary')?.textContent || bodyText
    );
    const name = normalizeText(
      documentFromHtml.querySelector('h1.product_title, h1.entry-title, .summary h1')?.textContent || ''
    );
    const categoryText = normalizeText(
      documentFromHtml.querySelector('.posted_in, .product_meta')?.textContent || ''
    );

    if (!name) return null;
    const craftSignal = /\bcraft\b/i.test(name) || /Craft Cannabis Flowers/i.test(categoryText);
    if (!craftSignal) return null;
    if (EXCLUDED_TERMS.some(term => `${name} ${categoryText}`.toLowerCase().includes(term))) return null;

    const explicitUnavailable = /currently out of stock|out of stock|sold out|unavailable/i.test(summaryText)
      || Boolean(documentFromHtml.querySelector('.stock.out-of-stock, .outofstock'));

    const ratingSource =
      documentFromHtml.querySelector('[itemprop="ratingValue"]')?.getAttribute('content')
      || documentFromHtml.querySelector('.woocommerce-product-rating .star-rating strong')?.textContent
      || documentFromHtml.querySelector('[aria-label*="Rated"]')?.getAttribute('aria-label')
      || summaryText;
    const rating = parseNumber(ratingSource, /Rated\s+([0-9.]+)\s+out of 5/i)
      ?? parseNumber(ratingSource, /([0-9.]+)\s*(?:\/\s*5)?/i);

    const reviewSource =
      documentFromHtml.querySelector('[itemprop="reviewCount"]')?.getAttribute('content')
      || documentFromHtml.querySelector('.woocommerce-review-link')?.textContent
      || summaryText;
    const reviews = parseNumber(reviewSource, /based on\s+([0-9,]+)\s+customer ratings?/i)
      ?? parseNumber(reviewSource, /([0-9,]+)\s+(?:customer\s+)?(?:ratings?|reviews?)/i)
      ?? parseNumber(reviewSource, /\(([0-9,]+)\s+(?:customer\s+)?reviews?\)/i);

    const flavours = parseLabelValue(summaryText, 'Flavou?r', ['Medical Usage', 'THC', 'CBD', 'Batch', 'Price']);
    const thcRange = summaryText.match(/THC\s*:\s*([0-9.]+)\s*[–—-]\s*([0-9.]+)\+?\s*%/i);
    const thcSingle = summaryText.match(/THC\s*:\s*([0-9.]+)\+?\s*%/i);
    const thcMin = numberOrNull(thcRange?.[1] ?? thcSingle?.[1]);
    const thcMax = numberOrNull(thcRange?.[2] ?? thcSingle?.[1]);
    const thcDisplay = thcRange
      ? `${thcRange[1]} – ${thcRange[2]}${/\+\s*%/.test(thcRange[0]) ? '+' : ''}%`
      : (thcSingle ? `${thcSingle[1]}${/\+\s*%/.test(thcSingle[0]) ? '+' : ''}%` : '');
    const cbdDisplay = normalizeText(summaryText.match(/CBD\s*:\s*([<>≤≥]?\s*[0-9.]+\+?\s*%)/i)?.[1] || '');
    const batch = normalizeText(summaryText.match(/Batch\s*:\s*([A-Za-z]+\s+\d{1,2}[,.]?\s+\d{4})/i)?.[1] || '');
    const strainType = normalizeText(`${name} ${categoryText}`.match(/\b(Indica|Sativa|Hybrid)\b/i)?.[1] || 'Unknown');
    const prices = extractVariationPrices(documentFromHtml, html);

    return normalizeProduct({
      name,
      strainType,
      rating,
      reviews,
      flavours,
      thcMin,
      thcMax,
      thcDisplay,
      cbdDisplay,
      batch,
      ...prices,
      available: !explicitUnavailable,
      source: 'bulkbuddy-product-page',
      sourceUrl,
      fetchedAt: new Date().toISOString()
    });
  }

  async function discoverProductUrls() {
    const visitedPages = new Set();
    const queuedPages = new Set(DISCOVERY_SEEDS.map(canonicalUrl));
    const queue = [...queuedPages];
    const productUrls = new Set();
    let pageFailures = 0;

    while (queue.length && visitedPages.size < MAX_DISCOVERY_PAGES) {
      const pageUrl = queue.shift();
      if (!pageUrl || visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);
      setStatus(`Scanning inventory sources ${visitedPages.size} of up to ${MAX_DISCOVERY_PAGES}… ${productUrls.size} craft links found.`);

      try {
        const response = await requestWithRetry(pageUrl, pageUrl === SEARCH_URL ? 1 : 2);
        const discovered = discoverLinks(response.html, response.url);
        discovered.productLinks.forEach(url => productUrls.add(url));
        discovered.paginationLinks.forEach(url => {
          if (!visitedPages.has(url) && !queuedPages.has(url)) {
            queuedPages.add(url);
            queue.push(url);
          }
        });
      } catch {
        pageFailures += 1;
      }
    }

    return {
      urls: [...productUrls].slice(0, MAX_PRODUCT_PAGES),
      visitedPages: visitedPages.size,
      pageFailures
    };
  }

  async function refreshCatalog() {
    if (isFetching) return;
    setFetching(true);

    try {
      const discovery = await discoverProductUrls();
      if (!discovery.urls.length) {
        throw new Error('No craft product links were found across the craft, cannabis, type, and homepage inventory sources.');
      }

      const extracted = [];
      let skippedUnavailable = 0;
      let skippedNonCraft = 0;
      let failed = 0;

      for (let index = 0; index < discovery.urls.length; index += 1) {
        const url = discovery.urls[index];
        setStatus(`Reading product page ${index + 1} of ${discovery.urls.length}… ${extracted.length} strains accepted.`);
        try {
          const response = await requestWithRetry(url);
          const product = parseProductPage(response.html, response.url);
          if (!product) {
            skippedNonCraft += 1;
            continue;
          }
          if (!product.available) {
            skippedUnavailable += 1;
            continue;
          }
          extracted.push(product);
        } catch {
          failed += 1;
        }
        if ((index + 1) % 4 === 0) await sleep(250);
      }

      const uniqueProducts = [...new Map(extracted.map(product => [product.sourceUrl || product.name.toLowerCase(), product])).values()];
      if (!uniqueProducts.length) {
        throw new Error('Craft product pages were discovered, but none could be accepted after retries.');
      }

      products = uniqueProducts;
      writeState();
      render();
      setStatus(
        `Fetched ${uniqueProducts.length} available craft strain${uniqueProducts.length === 1 ? '' : 's'} from ${discovery.urls.length} candidate product pages across ${discovery.visitedPages} inventory pages.` +
        `${skippedUnavailable ? ` Skipped ${skippedUnavailable} explicitly sold out.` : ''}` +
        `${skippedNonCraft ? ` Filtered ${skippedNonCraft} non-craft pages.` : ''}` +
        `${failed ? ` ${failed} page${failed === 1 ? '' : 's'} failed after retries.` : ''}` +
        `${discovery.pageFailures ? ` ${discovery.pageFailures} inventory source${discovery.pageFailures === 1 ? '' : 's'} could not be read.` : ''}`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to fetch Bulk Buddy strain information.', true);
    } finally {
      setFetching(false);
    }
  }

  window.CanShop = {
    receivePage(requestId, url, html) {
      const pending = pendingRequests.get(requestId);
      if (!pending) return;
      pendingRequests.delete(requestId);
      pending.resolve({ url, html });
    },
    receiveFetchError(requestId, message) {
      const pending = pendingRequests.get(requestId);
      if (!pending) return;
      pendingRequests.delete(requestId);
      pending.reject(new Error(message));
    }
  };

  function hydratePreferences() {
    els.targetThc.value = preferences.targetThc ?? 27;
    els.maxPricePerGram.value = preferences.maxPricePerGram ?? 8;
    els.preferredFlavours.value = (preferences.preferredFlavours || []).join(', ');
    els.availableOnly.checked = preferences.availableOnly !== false;
    els.comparisonPackage.value = preferences.comparisonPackage || 'quarterPound';
  }

  els.confirmAge.addEventListener('click', () => {
    localStorage.setItem(AGE_KEY, 'true');
    els.ageGate.hidden = true;
  });

  els.declineAge.addEventListener('click', () => {
    document.body.innerHTML = '<main><section class="panel empty"><h2>CanShop closed</h2><p>This research tool is restricted to people of legal cannabis age in their province or territory.</p></section></main>';
  });

  els.refreshButton.addEventListener('click', refreshCatalog);
  els.fetchButton.addEventListener('click', refreshCatalog);
  els.addProductButton.addEventListener('click', () => els.productDialog.showModal());
  els.closeDialog.addEventListener('click', () => els.productDialog.close());
  els.resultSearch.addEventListener('input', () => {
    resultQuery = els.resultSearch.value;
    render();
  });
  els.resultSort.addEventListener('change', () => {
    resultSort = els.resultSort.value;
    render();
  });
  els.resetSearch.addEventListener('click', () => {
    resultQuery = '';
    els.resultSearch.value = '';
    els.resultSearch.focus();
    render();
  });

  els.clearButton.addEventListener('click', () => {
    products = [];
    writeState();
    render();
    setStatus('The local comparison notebook was cleared.');
  });

  els.toggleSettings.addEventListener('click', () => {
    const willOpen = els.settingsForm.hidden;
    els.settingsForm.hidden = !willOpen;
    els.toggleSettings.textContent = willOpen ? 'Close' : 'Edit';
    els.toggleSettings.setAttribute('aria-expanded', String(willOpen));
  });

  els.settingsForm.addEventListener('submit', event => {
    event.preventDefault();
    preferences = {
      targetThc: numberOrNull(els.targetThc.value),
      maxPricePerGram: numberOrNull(els.maxPricePerGram.value),
      preferredFlavours: els.preferredFlavours.value.split(',').map(value => value.trim()).filter(Boolean),
      availableOnly: els.availableOnly.checked,
      comparisonPackage: els.comparisonPackage.value === 'ounce' ? 'ounce' : 'quarterPound'
    };
    writeState();
    render();
    setStatus('Research preferences applied.');
  });

  els.productForm.addEventListener('submit', event => {
    event.preventDefault();
    const candidate = normalizeProduct({
      name: els.productName.value,
      strainType: els.productType.value,
      batch: els.productBatch.value,
      oneOuncePrice: els.productOneOuncePrice.value,
      quarterPoundPrice: els.productQuarterPoundPrice.value,
      thcMin: els.productThcMin.value,
      thcMax: els.productThcMax.value,
      cbdDisplay: els.productCbd.value,
      rating: els.productRating.value,
      reviews: els.productReviews.value,
      flavours: els.productTerpenes.value,
      available: els.productAvailable.checked,
      source: 'manual-fallback'
    });
    if (!isAllowedFlower(candidate)) {
      setStatus('The manual entry must be a craft flower product and not an excluded format.', true);
      return;
    }
    products.push(candidate);
    writeState();
    els.productForm.reset();
    els.productAvailable.checked = true;
    els.productDialog.close();
    render();
    setStatus('Manual fallback entry added.');
  });

  hydratePreferences();
  els.ageGate.hidden = localStorage.getItem(AGE_KEY) === 'true';
  render();
})();
