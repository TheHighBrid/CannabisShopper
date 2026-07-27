(() => {
  'use strict';

  const STORAGE_KEY = 'canshop.products.v1';
  const PREFS_KEY = 'canshop.preferences.v1';
  const AGE_KEY = 'canshop.legalAgeConfirmed.v1';
  const SOURCE_URL = 'https://www.bulkbuddy.co/product-category/cannabis/craft-cannabis-flowers/';
  const EXCLUDED_TERMS = [
    'kief', 'hash', 'pre-roll', 'preroll', 'edible', 'gummy', 'vape', 'cartridge',
    'extract', 'concentrate', 'shatter', 'rosin', 'resin', 'cbd candy'
  ];
  const QP_GRAMS_MIN = 108;
  const QP_GRAMS_MAX = 118;
  const THREE_OZ_MIN = 80;
  const THREE_OZ_MAX = 90;
  const QP_SIGNIFICANT_VALUE_THRESHOLD = 0.85;

  const els = {
    ageGate: document.querySelector('#ageGate'),
    confirmAge: document.querySelector('#confirmAge'),
    declineAge: document.querySelector('#declineAge'),
    refreshButton: document.querySelector('#refreshButton'),
    loadSample: document.querySelector('#loadSample'),
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
    results: document.querySelector('#results'),
    emptyState: document.querySelector('#emptyState'),
    productDialog: document.querySelector('#productDialog'),
    closeDialog: document.querySelector('#closeDialog'),
    productForm: document.querySelector('#productForm'),
    productName: document.querySelector('#productName'),
    productPrice: document.querySelector('#productPrice'),
    productGrams: document.querySelector('#productGrams'),
    productThc: document.querySelector('#productThc'),
    productCbd: document.querySelector('#productCbd'),
    productRating: document.querySelector('#productRating'),
    productReviews: document.querySelector('#productReviews'),
    productTerpenes: document.querySelector('#productTerpenes'),
    productAvailable: document.querySelector('#productAvailable'),
    productVariety: document.querySelector('#productVariety')
  };

  let products = readJson(STORAGE_KEY, []);
  let preferences = readJson(PREFS_KEY, {
    targetThc: 24,
    maxPricePerGram: 8,
    preferredFlavours: ['citrus', 'gas', 'pine', 'berry'],
    availableOnly: true
  });

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
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

  function normalizeProduct(input) {
    const price = numberOrNull(input.price);
    const grams = numberOrNull(input.grams);
    return {
      id: input.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: String(input.name || 'Untitled craft flower').trim(),
      price,
      grams,
      pricePerGram: price != null && grams > 0 ? round(price / grams) : null,
      thc: numberOrNull(input.thc),
      cbd: numberOrNull(input.cbd),
      rating: numberOrNull(input.rating),
      reviews: numberOrNull(input.reviews),
      terpenes: String(input.terpenes || '').trim(),
      available: input.available !== false,
      variety: Boolean(input.variety),
      source: input.source || 'manual',
      sourceUrl: input.sourceUrl || null,
      sample: Boolean(input.sample)
    };
  }

  function isAllowedFlower(product) {
    const haystack = `${product.name} ${product.terpenes}`.toLowerCase();
    return !EXCLUDED_TERMS.some(term => haystack.includes(term));
  }

  function transparency(product) {
    const checks = [product.price, product.grams, product.thc, product.cbd, product.rating, product.reviews, product.terpenes];
    const present = checks.filter(value => value !== null && value !== '').length;
    return present / checks.length;
  }

  function scoreProduct(product, range) {
    const reasons = [];
    const cautions = [];

    let valueScore = 0.25;
    if (product.pricePerGram != null && range.min != null && range.max != null) {
      valueScore = range.min === range.max
        ? 0.8
        : clamp(1 - ((product.pricePerGram - range.min) / (range.max - range.min)), 0.1, 1);
      reasons.push(`Listed value is $${product.pricePerGram.toFixed(2)}/g.`);
      if (preferences.maxPricePerGram && product.pricePerGram > preferences.maxPricePerGram) {
        valueScore *= 0.65;
        cautions.push('Above your maximum price-per-gram preference.');
      }
    } else {
      cautions.push('Price per gram cannot be calculated.');
    }

    const transparencyScore = transparency(product);
    if (transparencyScore >= 0.72) reasons.push('Listing has comparatively strong field coverage.');
    if (transparencyScore < 0.5) cautions.push('Several comparison fields are missing.');

    let reviewScore = 0.25;
    if (product.rating != null && product.reviews != null) {
      const quality = clamp(product.rating / 5, 0, 1);
      const volume = Math.min(1, Math.log10(product.reviews + 1) / 2);
      reviewScore = quality * 0.72 + volume * 0.28;
      reasons.push(`${product.rating.toFixed(1)}/5 across ${product.reviews} review${product.reviews === 1 ? '' : 's'}.`);
    } else {
      cautions.push('Review signal is incomplete.');
    }

    let flavourScore = 0.35;
    const terpeneText = product.terpenes.toLowerCase();
    const matches = preferences.preferredFlavours.filter(word => terpeneText.includes(word.toLowerCase()));
    if (!terpeneText) {
      flavourScore = 0.2;
      cautions.push('Terpene or flavour notes are missing.');
    } else if (matches.length) {
      flavourScore = clamp(0.55 + matches.length * 0.15, 0, 1);
      reasons.push(`Preference match: ${matches.join(', ')}.`);
    }

    let cannabinoidScore = 0.25;
    if (product.thc != null || product.cbd != null) {
      cannabinoidScore = 0.62;
      if (product.thc != null && preferences.targetThc != null) {
        cannabinoidScore += Math.max(0, 0.3 - Math.abs(product.thc - preferences.targetThc) / 50);
      }
      if (product.thc != null && product.cbd != null) cannabinoidScore += 0.08;
    } else {
      cautions.push('THC and CBD details are missing.');
    }

    let total =
      valueScore * 30 +
      transparencyScore * 25 +
      reviewScore * 20 +
      flavourScore * 15 +
      clamp(cannabinoidScore, 0, 1) * 10;

    if (!product.available) {
      total -= 18;
      cautions.push('Listing appears unavailable.');
    }

    return {
      ...product,
      score: round(clamp(total, 0, 100), 1),
      transparencyScore,
      reasons,
      cautions
    };
  }

  function applyThreeOunceVsQuarterPoundRule(scored) {
    const varieties = scored.filter(item => item.variety && item.grams >= THREE_OZ_MIN && item.grams <= THREE_OZ_MAX && item.pricePerGram != null);
    const quarterPounds = scored.filter(item => item.grams >= QP_GRAMS_MIN && item.grams <= QP_GRAMS_MAX && item.pricePerGram != null);
    if (!varieties.length || !quarterPounds.length) return scored;

    const bestVariety = [...varieties].sort((a, b) => a.pricePerGram - b.pricePerGram)[0];
    return scored.map(item => {
      if (!quarterPounds.some(qp => qp.id === item.id)) return item;
      const hasComparableTransparency = item.transparencyScore >= bestVariety.transparencyScore - 0.1;
      const isSignificantlyCheaper = item.pricePerGram <= bestVariety.pricePerGram * QP_SIGNIFICANT_VALUE_THRESHOLD;
      if (isSignificantlyCheaper && hasComparableTransparency) {
        return {
          ...item,
          reasons: [...item.reasons, 'Quarter pound clears the 15% value threshold versus the best three-ounce variety bundle.']
        };
      }
      return {
        ...item,
        score: round(clamp(item.score - 12, 0, 100), 1),
        cautions: [...item.cautions, 'Single-strain quarter pound does not clear the 15% value threshold versus the best three-ounce variety bundle.']
      };
    });
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
    return applyThreeOunceVsQuarterPoundRule(eligible.map(product => scoreProduct(product, range)))
      .sort((a, b) => b.score - a.score || (a.pricePerGram ?? Infinity) - (b.pricePerGram ?? Infinity));
  }

  function formatMoney(value) {
    return value == null ? 'missing' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
  }

  function render() {
    const ranked = getRankedProducts();
    els.emptyState.hidden = ranked.length > 0;
    els.results.hidden = ranked.length === 0;
    els.metricCount.textContent = String(ranked.length);
    els.metricBest.textContent = ranked.length ? String(ranked[0].score) : '—';
    const validValues = ranked.map(item => item.pricePerGram).filter(value => value != null);
    els.metricValue.textContent = validValues.length ? `$${Math.min(...validValues).toFixed(2)}` : '—';

    els.results.innerHTML = ranked.map((item, index) => {
      const tags = [
        `<span class="chip ${item.available ? 'good' : 'warn'}">${item.available ? 'available signal' : 'unavailable signal'}</span>`,
        `<span class="chip">${item.grams == null ? 'size missing' : `${round(item.grams, 1)}g`}</span>`,
        `<span class="chip">${item.pricePerGram == null ? '$/g missing' : `$${item.pricePerGram.toFixed(2)}/g`}</span>`,
        item.thc == null ? '' : `<span class="chip">THC ${round(item.thc, 1)}%</span>`,
        item.variety ? '<span class="chip good">3 oz variety</span>' : '',
        item.sample ? '<span class="chip warn">sample data</span>' : ''
      ].filter(Boolean).join('');
      const explanation = item.reasons.slice(0, 2).join(' ') || 'Balanced using the available public listing fields.';
      const warning = item.cautions.length ? ` Watch-out: ${item.cautions[0]}` : '';
      return `
        <article class="result-card">
          <div class="result-top">
            <div class="rank">${index + 1}</div>
            <div class="result-name">
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(formatMoney(item.price))} · ${escapeHtml(item.source === 'live' ? 'public listing refresh' : item.source)}</p>
            </div>
            <div class="score">${item.score}<small>/100</small></div>
          </div>
          <div class="chips">${tags}</div>
          <p class="reason">${escapeHtml(explanation + warning)}</p>
          <div class="card-actions"><button class="remove" data-remove="${escapeHtml(item.id)}">Remove</button></div>
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

  function parseNumber(text, regex) {
    const match = String(text).match(regex);
    if (!match) return null;
    const value = Number(match[1].replaceAll(',', ''));
    return Number.isFinite(value) ? value : null;
  }

  function parsePackageGrams(text) {
    const ounces = parseNumber(text, /([0-9]+(?:\.[0-9]+)?)\s*(?:oz|ounce)s?\b/i);
    if (ounces != null) return round(ounces * 28.3495, 2);
    return parseNumber(text, /([0-9]+(?:\.[0-9]+)?)\s*g(?:ram)?s?\b/i);
  }

  function parseCatalog(html) {
    const documentFromHtml = new DOMParser().parseFromString(html, 'text/html');
    const cards = [...documentFromHtml.querySelectorAll('li.product, .type-product')];
    const seen = new Set();
    const parsed = [];

    for (const card of cards) {
      const name = card.querySelector('.woocommerce-loop-product__title, .product-title, h2, h3')?.textContent?.trim() || '';
      if (!name || seen.has(name.toLowerCase())) continue;
      const text = card.textContent.replace(/\s+/g, ' ').trim();
      if (EXCLUDED_TERMS.some(term => `${name} ${text}`.toLowerCase().includes(term))) continue;

      // Ignore sale discounts by preferring the crossed-out regular price when present.
      const priceText = card.querySelector('del .amount, del')?.textContent || card.querySelector('.price')?.textContent || text;
      const priceMatches = [...priceText.matchAll(/\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g)];
      const price = priceMatches.length ? Number(priceMatches[0][1].replaceAll(',', '')) : null;
      const grams = parsePackageGrams(`${name} ${text}`);
      const thc = parseNumber(text, /THC[^0-9]{0,15}([0-9]+(?:\.[0-9]+)?)\s*%/i) ?? parseNumber(text, /([0-9]+(?:\.[0-9]+)?)\s*%[^A-Za-z0-9]{0,12}THC/i);
      const cbd = parseNumber(text, /CBD[^0-9]{0,15}([0-9]+(?:\.[0-9]+)?)\s*%/i) ?? parseNumber(text, /([0-9]+(?:\.[0-9]+)?)\s*%[^A-Za-z0-9]{0,12}CBD/i);
      const ratingText = card.querySelector('[aria-label*="Rated"]')?.getAttribute('aria-label') || text;
      const rating = parseNumber(ratingText, /Rated\s+([0-9.]+)\s+out of 5/i) ?? parseNumber(ratingText, /([0-9.]+)\s*\/\s*5/);
      const reviews = parseNumber(text, /([0-9]+)\s*(?:customer\s*)?reviews?/i);
      const terpeneMatch = text.match(/(?:terpene|flavou?r|aroma|taste)s?:?\s*([^.|]{8,160})/i);
      const available = !/out of stock|sold out|unavailable/i.test(text);
      const link = card.querySelector('a[href*="/product/"]')?.href || SOURCE_URL;
      const variety = /variety|mix(?:ed)?\s*(?:ounce|oz)|3\s*oz.*(?:bundle|mix)/i.test(`${name} ${text}`);

      parsed.push(normalizeProduct({
        name,
        price,
        grams,
        thc,
        cbd,
        rating,
        reviews,
        terpenes: terpeneMatch ? terpeneMatch[1].trim() : '',
        available,
        variety,
        source: 'live',
        sourceUrl: link
      }));
      seen.add(name.toLowerCase());
    }
    return parsed;
  }

  function loadSamples() {
    products = [
      normalizeProduct({ name: 'Sample Citrus Craft 3 oz Variety', price: 465, grams: 85.05, thc: 27, cbd: 0.4, rating: 4.7, reviews: 42, terpenes: 'citrus, gas, pine', available: true, variety: true, source: 'sample', sample: true }),
      normalizeProduct({ name: 'Sample Forest Craft Quarter Pound', price: 590, grams: 113.4, thc: 29, cbd: 0.2, rating: 4.8, reviews: 18, terpenes: 'pine, earth, fuel', available: true, variety: false, source: 'sample', sample: true }),
      normalizeProduct({ name: 'Sample Berry Craft Ounce', price: 185, grams: 28.35, thc: 25, cbd: null, rating: 4.5, reviews: 61, terpenes: 'berry, cream, floral', available: true, variety: false, source: 'sample', sample: true })
    ];
    writeState();
    render();
    setStatus('Loaded a clearly labelled fictional sample set. Replace it with public listing data or manual entries.');
  }

  function refreshCatalog() {
    if (!window.Android || typeof window.Android.refreshCraftFlowerCatalog !== 'function') {
      setStatus('Live refresh is available inside the Android app. Use manual or sample data in a browser.', true);
      return;
    }
    els.refreshButton.disabled = true;
    setStatus('Refreshing the public craft-flower category…');
    window.Android.refreshCraftFlowerCatalog();
  }

  window.CanShop = {
    receiveCatalog(html) {
      try {
        const parsed = parseCatalog(html);
        if (!parsed.length) throw new Error('No eligible craft-flower cards were detected. The source layout may have changed.');
        products = parsed;
        writeState();
        render();
        setStatus(`Refreshed ${parsed.length} eligible craft-flower listing${parsed.length === 1 ? '' : 's'}. Discounts and non-flower formats were ignored.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Unable to parse the refreshed listing.', true);
      } finally {
        els.refreshButton.disabled = false;
      }
    },
    receiveError(message) {
      els.refreshButton.disabled = false;
      setStatus(`${message} You can still enter products manually.`, true);
    }
  };

  function hydratePreferences() {
    els.targetThc.value = preferences.targetThc ?? 24;
    els.maxPricePerGram.value = preferences.maxPricePerGram ?? 8;
    els.preferredFlavours.value = preferences.preferredFlavours.join(', ');
    els.availableOnly.checked = preferences.availableOnly !== false;
  }

  els.confirmAge.addEventListener('click', () => {
    localStorage.setItem(AGE_KEY, 'true');
    els.ageGate.hidden = true;
  });
  els.declineAge.addEventListener('click', () => {
    document.body.innerHTML = '<main><section class="panel empty"><h2>CanShop closed</h2><p>This research tool is restricted to people of legal cannabis age in their province or territory.</p></section></main>';
  });
  els.refreshButton.addEventListener('click', refreshCatalog);
  els.loadSample.addEventListener('click', loadSamples);
  els.addProductButton.addEventListener('click', () => els.productDialog.showModal());
  els.closeDialog.addEventListener('click', () => els.productDialog.close());
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
      availableOnly: els.availableOnly.checked
    };
    writeState();
    render();
    setStatus('Research preferences applied.');
  });
  els.productForm.addEventListener('submit', event => {
    event.preventDefault();
    const candidate = normalizeProduct({
      name: els.productName.value,
      price: els.productPrice.value,
      grams: els.productGrams.value,
      thc: els.productThc.value,
      cbd: els.productCbd.value,
      rating: els.productRating.value,
      reviews: els.productReviews.value,
      terpenes: els.productTerpenes.value,
      available: els.productAvailable.checked,
      variety: els.productVariety.checked,
      source: 'manual'
    });
    if (!isAllowedFlower(candidate)) {
      setStatus('That entry appears to be a non-flower cannabis format and was not added.', true);
      return;
    }
    products.push(candidate);
    writeState();
    els.productForm.reset();
    els.productAvailable.checked = true;
    els.productDialog.close();
    render();
    setStatus('Craft-flower entry added to the local comparison notebook.');
  });

  hydratePreferences();
  els.ageGate.hidden = localStorage.getItem(AGE_KEY) === 'true';
  render();
})();
