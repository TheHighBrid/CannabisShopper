(() => {
  'use strict';

  const STORAGE_KEY = 'canshop.products.v3';
  const LEGACY_STORAGE_KEYS = ['canshop.products.v2', 'canshop.products.v1'];
  const PREFS_KEY = 'canshop.preferences.v3';
  const LEGACY_PREFS_KEYS = ['canshop.preferences.v2', 'canshop.preferences.v1'];
  const PREFS_MIGRATION_KEY = 'canshop.preferences.neutralized.v1';
  const AGE_KEY = 'canshop.legalAgeConfirmed.v1';

  const ORIGIN = 'https://www.bulkbuddy.co';
  const SEARCH_URL = `${ORIGIN}/?term=craft-cannabis-flowers&s=&post_type=product&taxonomy=product_cat`;
  const CRAFT_CATEGORY_URL = `${ORIGIN}/product-category/cannabis/craft-cannabis-flowers/?shop_view=list_view&per_page=200`;
  const DISCOVERY_SEEDS = [
    CRAFT_CATEGORY_URL,
    SEARCH_URL,
    `${ORIGIN}/product-category/cannabis/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/aaaa/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/indica/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/hybrid/?shop_view=list_view&per_page=200`,
    `${ORIGIN}/product-category/cannabis/sativa/?shop_view=list_view&per_page=200`
  ];

  const EXCLUDED_TERMS = [
    'kief', 'hash', 'pre-roll', 'preroll', 'edible', 'gummy', 'vape', 'cartridge',
    'extract', 'concentrate', 'shatter', 'rosin', 'resin', 'cbd candy', 'shake', 'trim'
  ];
  const PACKAGE_GRAMS = { ounce: 28.3495, quarterPound: 113.398 };
  const PACKAGE_LABELS = { ounce: '1 Ounce', quarterPound: 'Quarter Pound' };
  const MAX_DISCOVERY_PAGES = 36;
  const MAX_PRODUCT_PAGES = 180;
  const REQUEST_ATTEMPTS = 4;
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
    targetThc: null,
    maxPricePerGram: null,
    preferredFlavours: [],
    availableOnly: false,
    comparisonPackage: 'ounce'
  };

  let products = readWithMigration(STORAGE_KEY, LEGACY_STORAGE_KEYS, []);
  let preferences = migratePreferences(readWithMigration(PREFS_KEY, LEGACY_PREFS_KEYS, defaultPreferences));
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

  function migratePreferences(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const next = {
      ...defaultPreferences,
      ...raw,
      preferredFlavours: Array.isArray(raw.preferredFlavours) ? raw.preferredFlavours : []
    };

    if (localStorage.getItem(PREFS_MIGRATION_KEY) !== 'true') {
      const looksLikeOldDefaults =
        Number(raw.targetThc) === 27 &&
        Number(raw.maxPricePerGram) === 8 &&
        Array.isArray(raw.preferredFlavours) &&
        ['citrus', 'gas', 'pine', 'berry', 'diesel'].every(value => raw.preferredFlavours.includes(value)) &&
        raw.availableOnly === true;
      const looksLikeBlankSeed =
        (raw.targetThc == null || raw.targetThc === '') &&
        (raw.maxPricePerGram == null || raw.maxPricePerGram === '') &&
        Array.isArray(raw.preferredFlavours) && raw.preferredFlavours.length === 0 &&
        raw.availableOnly === false;

      if (looksLikeOldDefaults || looksLikeBlankSeed) {
        next.targetThc = null;
        next.maxPricePerGram = null;
        next.preferredFlavours = [];
        next.availableOnly = false;
        next.comparisonPackage = 'ounce';
      }
      localStorage.setItem(PREFS_MIGRATION_KEY, 'true');
    }

    if (!['ounce', 'quarterPound'].includes(next.comparisonPackage)) next.comparisonPackage = 'ounce';
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    return next;
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

  function booleanOrNull(value) {
    return value === true ? true : value === false ? false : null;
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
    if (!els.status) return;
    els.status.textContent = message;
    els.status.classList.toggle('error', isError);
  }

  function setFetching(value) {
    isFetching = value;
    if (els.refreshButton) els.refreshButton.disabled = value;
    if (els.fetchButton) {
      els.fetchButton.disabled = value;
      els.fetchButton.textContent = value ? 'Verifying every craft strain…' : 'Fetch Bulk Buddy strains';
    }
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

  function selectedPackageFields(input) {
    const selected = preferences.comparisonPackage === 'quarterPound' ? 'quarterPound' : 'ounce';
    if (selected === 'quarterPound') {
      return {
        selected,
        price: numberOrNull(input.quarterPoundPrice),
        available: booleanOrNull(input.quarterPoundAvailable),
        grams: PACKAGE_GRAMS.quarterPound
      };
    }
    return {
      selected,
      price: numberOrNull(input.oneOuncePrice),
      available: booleanOrNull(input.oneOunceAvailable),
      grams: PACKAGE_GRAMS.ounce
    };
  }

  function normalizeProduct(input) {
    const oneOuncePrice = numberOrNull(input.oneOuncePrice ?? input.price);
    const quarterPoundPrice = numberOrNull(input.quarterPoundPrice);
    const oneOunceAvailable = booleanOrNull(input.oneOunceAvailable) ?? (oneOuncePrice != null ? true : null);
    const quarterPoundAvailable = booleanOrNull(input.quarterPoundAvailable) ?? (quarterPoundPrice != null ? true : null);
    const thcMin = numberOrNull(input.thcMin ?? input.thc);
    const thcMax = numberOrNull(input.thcMax ?? input.thc);
    const selected = selectedPackageFields({
      oneOuncePrice,
      quarterPoundPrice,
      oneOunceAvailable,
      quarterPoundAvailable
    });
    const comparisonPrice = selected.price;
    const comparisonGrams = selected.grams;

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
      oneOunceAvailable,
      quarterPoundAvailable,
      comparisonPackage: selected.selected,
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

  function selectedPackageAvailability(product) {
    return preferences.comparisonPackage === 'quarterPound'
      ? product.quarterPoundAvailable
      : product.oneOunceAvailable;
  }

  function isEligibleForSelectedPackage(product) {
    const available = selectedPackageAvailability(product);
    const price = preferences.comparisonPackage === 'quarterPound'
      ? product.quarterPoundPrice
      : product.oneOuncePrice;
    return product.available && available === true && price != null;
  }

  function transparency(product) {
    const checks = [
      product.comparisonPrice,
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

  function absoluteValueScore(pricePerGram) {
    if (pricePerGram == null) return 0.2;
    return clamp((10 - pricePerGram) / 8, 0, 1);
  }

  function absolutePotencyScore(product) {
    const thcAverage = average(product.thcMin, product.thcMax);
    if (thcAverage == null) return 0.25;
    if (preferences.targetThc != null) {
      return clamp(1 - Math.abs(thcAverage - preferences.targetThc) / 20, 0.15, 1);
    }
    return clamp((thcAverage - 15) / 20, 0.2, 1);
  }

  function scoreProduct(product) {
    const reasons = [];
    const cautions = [];
    let valueScore = absoluteValueScore(product.pricePerGram);

    if (product.pricePerGram != null) {
      reasons.push(`${PACKAGE_LABELS[preferences.comparisonPackage]} value is $${product.pricePerGram.toFixed(2)}/g.`);
      if (preferences.maxPricePerGram != null && product.pricePerGram > preferences.maxPricePerGram) {
        valueScore *= 0.65;
        cautions.push('Above your maximum price-per-gram preference.');
      }
    } else {
      cautions.push(`The ${PACKAGE_LABELS[preferences.comparisonPackage]} price could not be verified.`);
    }

    const transparencyScore = transparency(product);
    if (transparencyScore >= 0.8) reasons.push('Product page supplied nearly every requested field.');
    if (transparencyScore < 0.6) cautions.push('Several product-page fields are missing.');

    let reviewScore = 0.25;
    if (product.rating != null && product.reviews != null) {
      const quality = clamp(product.rating / 5, 0, 1);
      const volume = Math.min(1, Math.log10(product.reviews + 1) / 2.4);
      reviewScore = quality * 0.72 + volume * 0.28;
      reasons.push(`${product.rating.toFixed(2)}/5 from ${product.reviews} ratings.`);
    } else {
      cautions.push('Rating or review count is missing.');
    }

    let flavourScore = 0.5;
    const flavourText = product.flavours.toLowerCase();
    const flavourPrefs = Array.isArray(preferences.preferredFlavours) ? preferences.preferredFlavours : [];
    const matches = flavourPrefs.filter(word => flavourText.includes(String(word).toLowerCase()));
    if (!flavourText) {
      flavourScore = 0.25;
      cautions.push('Flavour information is missing.');
    } else if (flavourPrefs.length) {
      flavourScore = matches.length ? clamp(0.55 + matches.length * 0.12, 0, 1) : 0.35;
      if (matches.length) reasons.push(`Flavour match: ${matches.join(', ')}.`);
    }

    const potencyScore = absolutePotencyScore(product);
    const total =
      valueScore * 30 +
      transparencyScore * 25 +
      reviewScore * 20 +
      flavourScore * 15 +
      potencyScore * 10;

    return {
      ...product,
      score: round(clamp(total, 0, 100), 1),
      transparencyScore,
      reasons,
      cautions
    };
  }

  function getRankedProducts() {
    return products
      .map(normalizeProduct)
      .filter(isAllowedFlower)
      .filter(product => !preferences.availableOnly || product.available)
      .filter(isEligibleForSelectedPackage)
      .map(scoreProduct)
      .sort((a, b) =>
        b.score - a.score ||
        (a.pricePerGram ?? Infinity) - (b.pricePerGram ?? Infinity) ||
        a.name.localeCompare(b.name, 'en-CA', { sensitivity: 'base' })
      );
  }

  function formatMoney(value) {
    return value == null
      ? 'Could not verify'
      : new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
        maximumFractionDigits: 2
      }).format(value);
  }

  function packagePriceHtml(label, price, grams, available) {
    if (available === false) {
      return `<div class="package-price"><span>${escapeHtml(label)}</span><strong>Not available</strong><small>package not currently offered</small></div>`;
    }
    const ppg = price == null ? null : price / grams;
    return `<div class="package-price">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatMoney(price))}</strong>
      <small>${ppg == null ? 'verification incomplete' : `$${ppg.toFixed(2)}/g`}</small>
    </div>`;
  }

  function render() {
    const ranked = getRankedProducts();
    const normalizedQuery = resultQuery.trim().toLowerCase();
    const visible = ranked.filter(item => {
      if (!normalizedQuery) return true;
      return `${item.name} ${item.strainType} ${item.flavours}`.toLowerCase().includes(normalizedQuery);
    }).sort((a, b) => {
      if (resultSort === 'price') return (a.pricePerGram ?? Infinity) - (b.pricePerGram ?? Infinity) || a.name.localeCompare(b.name);
      if (resultSort === 'thc') return (average(b.thcMin, b.thcMax) ?? -1) - (average(a.thcMin, a.thcMax) ?? -1) || a.name.localeCompare(b.name);
      if (resultSort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1) || (b.reviews ?? 0) - (a.reviews ?? 0) || a.name.localeCompare(b.name);
      if (resultSort === 'name') return a.name.localeCompare(b.name, 'en-CA', { sensitivity: 'base' });
      return b.score - a.score || (a.pricePerGram ?? Infinity) - (b.pricePerGram ?? Infinity) || a.name.localeCompare(b.name);
    });

    const hasProducts = ranked.length > 0;
    if (els.emptyState) els.emptyState.hidden = hasProducts;
    if (els.noMatchesState) els.noMatchesState.hidden = !hasProducts || visible.length > 0;
    if (els.results) els.results.hidden = visible.length === 0;
    if (els.resultSummary) {
      els.resultSummary.hidden = !hasProducts;
      els.resultSummary.textContent = normalizedQuery
        ? `Showing ${visible.length} of ${ranked.length} eligible strain${ranked.length === 1 ? '' : 's'}`
        : `${ranked.length} eligible ${PACKAGE_LABELS[preferences.comparisonPackage]} strain${ranked.length === 1 ? '' : 's'}`;
    }
    if (els.metricCount) els.metricCount.textContent = String(ranked.length);
    if (els.metricBest) els.metricBest.textContent = ranked.length ? String(ranked[0].score) : '–';
    const validValues = ranked.map(item => item.pricePerGram).filter(value => value != null);
    if (els.metricValue) els.metricValue.textContent = validValues.length ? `$${Math.min(...validValues).toFixed(2)}` : '–';

    if (!els.results) return;
    els.results.innerHTML = visible.map((item, index) => {
      const explanation = item.reasons.slice(0, 2).join(' ') || 'Ranked from verified product-page fields.';
      const warning = item.cautions.length ? ` Watch-out: ${item.cautions[0]}` : '';
      return `
        <article class="result-card">
          <div class="result-top">
            <div class="rank">${index + 1}</div>
            <div class="result-name">
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.strainType)} · ${PACKAGE_LABELS[preferences.comparisonPackage]} verified available</p>
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
            ${packagePriceHtml('1 Ounce', item.oneOuncePrice, PACKAGE_GRAMS.ounce, item.oneOunceAvailable)}
            ${packagePriceHtml('Quarter Pound', item.quarterPoundPrice, PACKAGE_GRAMS.quarterPound, item.quarterPoundAvailable)}
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

  function createPendingRequest(requestId, timeoutMessage) {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(timeoutMessage));
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
    });
  }

  function requestBulkBuddyPage(url) {
    if (!window.Android || typeof window.Android.fetchBulkBuddyPage !== 'function') {
      return Promise.reject(new Error('Website fetching is available inside the Android app.'));
    }
    const requestId = `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pending = createPendingRequest(requestId, 'The website request timed out.');
    window.Android.fetchBulkBuddyPage(requestId, url);
    return pending;
  }

  function requestBulkBuddyVariation(productUrl, payload) {
    if (!window.Android || typeof window.Android.fetchBulkBuddyVariation !== 'function') {
      return Promise.reject(new Error('This app build cannot verify AJAX-loaded package prices.'));
    }
    const requestId = `variation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pending = createPendingRequest(requestId, 'The package-price verification timed out.');
    window.Android.fetchBulkBuddyVariation(requestId, productUrl, JSON.stringify(payload));
    return pending.then(response => {
      try {
        return JSON.parse(response.html);
      } catch {
        throw new Error('Bulk Buddy returned unreadable package data.');
      }
    });
  }

  async function requestWithRetry(url, attempts = REQUEST_ATTEMPTS) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await requestBulkBuddyPage(url);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await sleep(Math.min(5_000, 700 * (2 ** (attempt - 1))));
      }
    }
    throw lastError || new Error('Unable to fetch the page.');
  }

  async function variationWithRetry(productUrl, payload, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await requestBulkBuddyVariation(productUrl, payload);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await sleep(500 * attempt);
      }
    }
    throw lastError || new Error('Unable to verify the package price.');
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
    ['add-to-cart', 'orderby', '_canshop'].forEach(key => url.searchParams.delete(key));
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
      return category || search;
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
      .replace(/¼/g, ' 1-4 ')
      .replace(/½/g, ' 1-2 ')
      .replaceAll('_', '-')
      .replace(/[^a-z0-9.]+/g, '-');
  }

  function variationMatches(label, packageKey) {
    const normalized = normalizeVariationLabel(label);
    if (packageKey === 'ounce') {
      return /(^|-)1(-)?ounce($|-)|(^|-)one-ounce($|-)|(^|-)1-?oz($|-)|(^|-)28(?:[.-]0{1,2})?-?g(?:rams?)?($|-)|(^|-)28[.]35-?g(?:rams?)?($|-)/.test(normalized)
        && !/quarter|half|3-?ounce|4-?ounce|112-?g|113/.test(normalized);
    }
    return /quarter-pound|1-4-pound|one-quarter-pound|(^|-)qp($|-)|(^|-)4-?oz($|-)|(^|-)4-?ounce($|-)|(^|-)112-?g(?:rams?)?($|-)|(^|-)113(?:[.]4)?-?g(?:rams?)?($|-)/.test(normalized);
  }

  function emptyVariationResult() {
    return {
      oneOuncePrice: null,
      quarterPoundPrice: null,
      oneOunceRegularPrice: null,
      quarterPoundRegularPrice: null,
      oneOunceAvailable: null,
      quarterPoundAvailable: null,
      embeddedVariationPayload: false
    };
  }

  function applyVariation(result, variation, label) {
    const current = numberOrNull(variation?.display_price ?? variation?.price);
    const regular = numberOrNull(variation?.display_regular_price ?? variation?.regular_price);
    const available = variation?.variation_is_active !== false
      && variation?.is_in_stock !== false
      && variation?.is_purchasable !== false;

    if (variationMatches(label, 'ounce')) {
      result.oneOunceAvailable = available;
      if (available && current != null) result.oneOuncePrice = current;
      if (regular != null) result.oneOunceRegularPrice = regular;
    }
    if (variationMatches(label, 'quarterPound')) {
      result.quarterPoundAvailable = available;
      if (available && current != null) result.quarterPoundPrice = current;
      if (regular != null) result.quarterPoundRegularPrice = regular;
    }
  }

  function extractVariationPrices(documentFromHtml, html) {
    const result = emptyVariationResult();
    const variationArrays = [];

    for (const node of documentFromHtml.querySelectorAll('[data-product_variations]')) {
      const raw = node.getAttribute('data-product_variations');
      if (!raw || raw === 'false') continue;
      for (const candidate of [raw, decodeHtmlEntities(raw)]) {
        try {
          const parsed = JSON.parse(candidate);
          if (Array.isArray(parsed)) variationArrays.push(parsed);
          break;
        } catch {
        }
      }
    }

    for (const match of html.matchAll(/data-product_variations=(?:"([^"]+)"|'([^']+)')/gi)) {
      const raw = match[1] || match[2] || '';
      if (!raw || raw === 'false') continue;
      try {
        const parsed = JSON.parse(decodeHtmlEntities(raw));
        if (Array.isArray(parsed)) variationArrays.push(parsed);
      } catch {
      }
    }

    if (variationArrays.length) result.embeddedVariationPayload = true;
    for (const variations of variationArrays) {
      for (const variation of variations) {
        if (!variation) continue;
        const label = Object.entries(variation.attributes || {})
          .map(([key, value]) => `${key} ${value}`)
          .join(' ');
        applyVariation(result, variation, label);
      }
    }

    const decodedHtml = decodeHtmlEntities(html);
    for (const match of decodedHtml.matchAll(/\{[^{}]{0,1800}"display_price"\s*:\s*([0-9.]+)[^{}]{0,1800}"attributes"\s*:\s*\{([^{}]+)\}[^{}]{0,800}\}/gi)) {
      const label = match[2];
      const price = numberOrNull(match[1]);
      if (variationMatches(label, 'ounce') && result.oneOuncePrice == null) {
        result.oneOuncePrice = price;
        result.oneOunceAvailable = price != null ? true : result.oneOunceAvailable;
      }
      if (variationMatches(label, 'quarterPound') && result.quarterPoundPrice == null) {
        result.quarterPoundPrice = price;
        result.quarterPoundAvailable = price != null ? true : result.quarterPoundAvailable;
      }
    }

    return result;
  }

  function findVariationRequest(documentFromHtml, packageKey) {
    const form = documentFromHtml.querySelector('form.variations_form');
    if (!form) return { state: 'unknown', payload: null };

    const productId = normalizeText(
      form.getAttribute('data-product_id') ||
      form.querySelector('[name="product_id"]')?.value ||
      form.querySelector('[name="add-to-cart"]')?.value ||
      ''
    );
    if (!/^\d+$/.test(productId)) return { state: 'unknown', payload: null };

    const selects = [...form.querySelectorAll('select[name^="attribute_"]')];
    if (!selects.length) return { state: 'unknown', payload: null };

    let target = null;
    let targetOption = null;
    for (const select of selects) {
      const options = [...select.options].filter(option => option.value);
      const candidate = options.find(option => variationMatches(`${option.value} ${option.textContent}`, packageKey));
      if (candidate) {
        target = select;
        targetOption = candidate;
        break;
      }
    }

    if (!target || !targetOption) {
      const weightSelect = selects.find(select => [...select.options].some(option =>
        /ounce|quarter|pound|grams?|\boz\b/i.test(`${option.value} ${option.textContent}`)
      ));
      return weightSelect ? { state: 'unavailable', payload: null } : { state: 'unknown', payload: null };
    }

    if (targetOption.disabled) return { state: 'unavailable', payload: null };

    const attributes = {};
    for (const select of selects) {
      const name = select.name;
      if (!/^attribute_[a-z0-9_-]+$/i.test(name)) continue;
      if (select === target) {
        attributes[name] = targetOption.value;
        continue;
      }
      const current = select.value;
      if (current) {
        attributes[name] = current;
        continue;
      }
      const usable = [...select.options].filter(option => option.value && !option.disabled);
      if (usable.length === 1) attributes[name] = usable[0].value;
      else if (usable.length > 1) return { state: 'unknown', payload: null };
    }

    return {
      state: 'request',
      payload: { product_id: productId, ...attributes }
    };
  }

  async function resolvePackageViaAjax(documentFromHtml, sourceUrl, packageKey, result) {
    const priceKey = packageKey === 'ounce' ? 'oneOuncePrice' : 'quarterPoundPrice';
    const regularKey = packageKey === 'ounce' ? 'oneOunceRegularPrice' : 'quarterPoundRegularPrice';
    const availableKey = packageKey === 'ounce' ? 'oneOunceAvailable' : 'quarterPoundAvailable';
    if (result[availableKey] !== null && (result[availableKey] === false || result[priceKey] != null)) return;

    const request = findVariationRequest(documentFromHtml, packageKey);
    if (request.state === 'unavailable') {
      result[availableKey] = false;
      return;
    }
    if (request.state !== 'request' || !request.payload) return;

    const variation = await variationWithRetry(sourceUrl, request.payload);
    if (variation === false || variation == null || typeof variation !== 'object') {
      result[availableKey] = false;
      return;
    }

    const available = variation.variation_is_active !== false
      && variation.is_in_stock !== false
      && variation.is_purchasable !== false;
    result[availableKey] = available;
    const current = numberOrNull(variation.display_price ?? variation.price);
    const regular = numberOrNull(variation.display_regular_price ?? variation.regular_price);
    if (available && current != null) result[priceKey] = current;
    if (regular != null) result[regularKey] = regular;
  }

  async function parseProductPage(html, sourceUrl) {
    const documentFromHtml = new DOMParser().parseFromString(html, 'text/html');
    const bodyText = normalizeText(documentFromHtml.body?.textContent || '');
    const summaryNode = documentFromHtml.querySelector('.summary, .product-summary-wrap, .entry-summary');
    const summaryText = normalizeText(summaryNode?.textContent || bodyText);
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

    const explicitUnavailable = Boolean(
      summaryNode?.querySelector('.stock.out-of-stock, .outofstock') ||
      documentFromHtml.querySelector('.summary .stock.out-of-stock, .summary.outofstock')
    ) || /currently out of stock|this product is out of stock|sold out/i.test(summaryText);

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
    const thcRange = summaryText.match(/THC\s*:\s*([0-9.]+)\s*[–-]\s*([0-9.]+)\+?\s*%/i);
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

    if (!explicitUnavailable) {
      await resolvePackageViaAjax(documentFromHtml, sourceUrl, 'ounce', prices);
      await resolvePackageViaAjax(documentFromHtml, sourceUrl, 'quarterPound', prices);
    }

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
    const failedPages = [];

    while (queue.length && visitedPages.size < MAX_DISCOVERY_PAGES) {
      const pageUrl = queue.shift();
      if (!pageUrl || visitedPages.has(pageUrl)) continue;
      visitedPages.add(pageUrl);
      setStatus(`Scanning inventory source ${visitedPages.size} of up to ${MAX_DISCOVERY_PAGES}… ${productUrls.size} craft links found.`);

      try {
        const response = await requestWithRetry(pageUrl);
        const discovered = discoverLinks(response.html, response.url);
        discovered.productLinks.forEach(url => productUrls.add(url));
        discovered.paginationLinks.forEach(url => {
          if (!visitedPages.has(url) && !queuedPages.has(url)) {
            queuedPages.add(url);
            queue.push(url);
          }
        });
      } catch (error) {
        failedPages.push({ url: pageUrl, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return {
      urls: [...productUrls].sort().slice(0, MAX_PRODUCT_PAGES),
      visitedPages: visitedPages.size,
      failedPages
    };
  }

  function selectedPackageIssue(product) {
    const key = preferences.comparisonPackage;
    const available = key === 'ounce' ? product.oneOunceAvailable : product.quarterPoundAvailable;
    const price = key === 'ounce' ? product.oneOuncePrice : product.quarterPoundPrice;
    if (available === null) return 'unknown availability';
    if (available === true && price == null) return 'missing price';
    return null;
  }

  async function refreshCatalog() {
    if (isFetching) return;
    setFetching(true);
    const previousProducts = products;

    try {
      const discovery = await discoverProductUrls();
      if (discovery.failedPages.length) {
        const failedNames = discovery.failedPages.slice(0, 2).map(item => new URL(item.url).pathname).join(', ');
        throw new Error(`Incomplete fetch: ${discovery.failedPages.length} inventory source${discovery.failedPages.length === 1 ? '' : 's'} failed after retries (${failedNames}). Previous results were kept and no history snapshot was saved.`);
      }
      if (!discovery.urls.length) {
        throw new Error('Incomplete fetch: no craft product links were found. Previous results were kept.');
      }

      const accepted = [];
      const packageUnavailable = [];
      const soldOut = [];
      const failedPages = [];
      const extractionFailures = [];
      let skippedNonCraft = 0;

      for (let index = 0; index < discovery.urls.length; index += 1) {
        const url = discovery.urls[index];
        setStatus(`Verifying product ${index + 1} of ${discovery.urls.length}… ${accepted.length} eligible ${PACKAGE_LABELS[preferences.comparisonPackage]} strains confirmed.`);
        try {
          const response = await requestWithRetry(url);
          const product = await parseProductPage(response.html, response.url);
          if (!product) {
            skippedNonCraft += 1;
            continue;
          }
          if (!product.available) {
            soldOut.push(product.name);
            continue;
          }
          const issue = selectedPackageIssue(product);
          if (issue) {
            extractionFailures.push(`${product.name}: ${issue}`);
            continue;
          }
          if (!isEligibleForSelectedPackage(product)) {
            packageUnavailable.push(product.name);
            continue;
          }
          accepted.push(product);
        } catch (error) {
          failedPages.push({
            url,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        if ((index + 1) % 4 === 0) await sleep(300);
      }

      if (failedPages.length || extractionFailures.length) {
        const details = [
          failedPages.length ? `${failedPages.length} product page${failedPages.length === 1 ? '' : 's'} failed` : '',
          extractionFailures.length ? `${extractionFailures.length} selected-package record${extractionFailures.length === 1 ? '' : 's'} could not be verified` : ''
        ].filter(Boolean).join(' and ');
        throw new Error(`Incomplete fetch: ${details}. Previous results were kept and no history snapshot was saved.`);
      }

      const uniqueProducts = [...new Map(
        accepted.map(product => [product.sourceUrl || product.name.toLowerCase(), product])
      ).values()];
      if (!uniqueProducts.length) {
        throw new Error(`No current craft strains with a verified ${PACKAGE_LABELS[preferences.comparisonPackage]} package were found.`);
      }

      products = uniqueProducts;
      writeState();
      render();
      setStatus(
        `Fetched ${uniqueProducts.length} verified ${PACKAGE_LABELS[preferences.comparisonPackage]} craft strain${uniqueProducts.length === 1 ? '' : 's'} from ${discovery.urls.length} candidate product pages across ${discovery.visitedPages} inventory pages.` +
        `${packageUnavailable.length ? ` Excluded ${packageUnavailable.length} without ${PACKAGE_LABELS[preferences.comparisonPackage]}.` : ''}` +
        `${soldOut.length ? ` Excluded ${soldOut.length} sold out product${soldOut.length === 1 ? '' : 's'}.` : ''}` +
        `${skippedNonCraft ? ` Filtered ${skippedNonCraft} non-craft page${skippedNonCraft === 1 ? '' : 's'}.` : ''}`
      );
    } catch (error) {
      products = previousProducts;
      render();
      const message = error instanceof Error ? error.message : 'Unable to fetch Bulk Buddy strain information.';
      setStatus(message, true);
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
    if (els.targetThc) els.targetThc.value = preferences.targetThc ?? '';
    if (els.maxPricePerGram) els.maxPricePerGram.value = preferences.maxPricePerGram ?? '';
    if (els.preferredFlavours) els.preferredFlavours.value = (preferences.preferredFlavours || []).join(', ');
    if (els.availableOnly) els.availableOnly.checked = preferences.availableOnly === true;
    if (els.comparisonPackage) els.comparisonPackage.value = preferences.comparisonPackage || 'ounce';
  }

  if (els.confirmAge) {
    els.confirmAge.addEventListener('click', () => {
      localStorage.setItem(AGE_KEY, 'true');
      if (els.ageGate) els.ageGate.hidden = true;
    });
  }

  if (els.declineAge) {
    els.declineAge.addEventListener('click', () => {
      document.body.innerHTML = '<main><section class="panel empty"><h2>CanShop closed</h2><p>This research tool is restricted to people of legal cannabis age in their province or territory.</p></section></main>';
    });
  }

  if (els.refreshButton) els.refreshButton.addEventListener('click', refreshCatalog);
  if (els.fetchButton) els.fetchButton.addEventListener('click', refreshCatalog);
  if (els.addProductButton) els.addProductButton.addEventListener('click', () => els.productDialog?.showModal());
  if (els.closeDialog) els.closeDialog.addEventListener('click', () => els.productDialog?.close());
  if (els.resultSearch) {
    els.resultSearch.addEventListener('input', () => {
      resultQuery = els.resultSearch.value;
      render();
    });
  }
  if (els.resultSort) {
    els.resultSort.addEventListener('change', () => {
      resultSort = els.resultSort.value;
      render();
    });
  }
  if (els.resetSearch) {
    els.resetSearch.addEventListener('click', () => {
      resultQuery = '';
      if (els.resultSearch) {
        els.resultSearch.value = '';
        els.resultSearch.focus();
      }
      render();
    });
  }

  if (els.clearButton) {
    els.clearButton.addEventListener('click', () => {
      products = [];
      writeState();
      render();
      setStatus('The local comparison notebook was cleared.');
    });
  }

  if (els.toggleSettings) {
    els.toggleSettings.addEventListener('click', () => {
      const willOpen = Boolean(els.settingsForm?.hidden);
      if (els.settingsForm) els.settingsForm.hidden = !willOpen;
      els.toggleSettings.textContent = willOpen ? 'Close' : 'Edit';
      els.toggleSettings.setAttribute('aria-expanded', String(willOpen));
    });
  }

  if (els.settingsForm) {
    els.settingsForm.addEventListener('submit', event => {
      event.preventDefault();
      const priorPackage = preferences.comparisonPackage;
      preferences = {
        targetThc: numberOrNull(els.targetThc?.value),
        maxPricePerGram: numberOrNull(els.maxPricePerGram?.value),
        preferredFlavours: String(els.preferredFlavours?.value || '').split(',').map(value => value.trim()).filter(Boolean),
        availableOnly: els.availableOnly?.checked === true,
        comparisonPackage: els.comparisonPackage?.value === 'quarterPound' ? 'quarterPound' : 'ounce'
      };
      writeState();
      render();
      if (priorPackage !== preferences.comparisonPackage) {
        setStatus(`Ranking package changed to ${PACKAGE_LABELS[preferences.comparisonPackage]}. Rebuilding verified eligibility…`);
        refreshCatalog();
      } else {
        setStatus('Research preferences applied. Scores are deterministic for the same product data and preferences.');
      }
    });
  }

  if (els.productForm) {
    els.productForm.addEventListener('submit', event => {
      event.preventDefault();
      const oneOuncePrice = numberOrNull(els.productOneOuncePrice?.value);
      const quarterPoundPrice = numberOrNull(els.productQuarterPoundPrice?.value);
      const candidate = normalizeProduct({
        name: els.productName?.value,
        strainType: els.productType?.value,
        batch: els.productBatch?.value,
        oneOuncePrice,
        quarterPoundPrice,
        oneOunceAvailable: oneOuncePrice != null,
        quarterPoundAvailable: quarterPoundPrice != null,
        thcMin: els.productThcMin?.value,
        thcMax: els.productThcMax?.value,
        cbdDisplay: els.productCbd?.value,
        rating: els.productRating?.value,
        reviews: els.productReviews?.value,
        flavours: els.productTerpenes?.value,
        available: els.productAvailable?.checked === true,
        source: 'manual-fallback'
      });
      if (!isAllowedFlower(candidate)) {
        setStatus('The manual entry must be a craft flower product and not an excluded format.', true);
        return;
      }
      if (!isEligibleForSelectedPackage(candidate)) {
        setStatus(`The manual entry needs a verified ${PACKAGE_LABELS[preferences.comparisonPackage]} price to enter this shortlist.`, true);
        return;
      }
      products.push(candidate);
      writeState();
      els.productForm.reset();
      if (els.productAvailable) els.productAvailable.checked = true;
      els.productDialog?.close();
      render();
      setStatus('Manual fallback entry added.');
    });
  }

  hydratePreferences();
  if (els.ageGate) els.ageGate.hidden = localStorage.getItem(AGE_KEY) === 'true';
  render();
})();
