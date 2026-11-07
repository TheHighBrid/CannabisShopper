(() => {
  'use strict';

  const STORAGE_KEY = 'canshop.cannacabana.v1';
  const BULK_STORAGE_KEY = 'canshop.products.v3';
  const API_ORIGIN = 'https://app.cannacabana.com';
  const SHOP_ORIGIN = 'https://cannacabana.com';
  const STORE_ID = '3658';
  const COLLECTION = 'whole-flower';
  const MIN_SIZE_GRAMS = 14;
  const MAX_SIZE_GRAMS = 28;
  const THC_MIN = 29.0;
  const THC_MAX = 100.0;
  const REQUEST_TIMEOUT_MS = 35_000;
  const pending = new Map();

  const els = {
    button: document.querySelector('#fetchCannaButton'),
    buttonMobile: document.querySelector('#fetchCannaButtonMobile'),
    status: document.querySelector('#cannaStatus'),
    count: document.querySelector('#cannaCount'),
    bestValue: document.querySelector('#cannaBestValue'),
    highestThc: document.querySelector('#cannaHighestThc'),
    results: document.querySelector('#cannaResults'),
    empty: document.querySelector('#cannaEmpty'),
    compareResults: document.querySelector('#crossSourceResults'),
    compareEmpty: document.querySelector('#crossSourceEmpty'),
    compareSummary: document.querySelector('#crossSourceSummary'),
    compareSort: document.querySelector('#crossSourceSort')
  };

  let products = readJson(STORAGE_KEY, []);
  let isFetching = false;

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function numberOrNull(value) {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeText(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function round(value, places = 2) {
    const power = 10 ** places;
    return Math.round(value * power) / power;
  }

  function makeRequestId() {
    return `canna-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function requestPage(url) {
    if (!window.Android || typeof window.Android.fetchCannaCabanaPage !== 'function') {
      return Promise.reject(new Error('This CanShop build does not include the Canna Cabana network bridge.'));
    }

    return new Promise((resolve, reject) => {
      const requestId = makeRequestId();
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        try {
          if (window.Android && typeof window.Android.cancelCannaCabanaRequest === 'function') {
            window.Android.cancelCannaCabanaRequest(requestId);
          }
        } catch {
        }
        reject(new Error('Canna Cabana gave no response (neither data nor an error) within 35 seconds. The request may be stuck in the native queue or blocked before it started.'));
      }, REQUEST_TIMEOUT_MS);

      pending.set(requestId, {
        resolve(value) {
          window.clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          window.clearTimeout(timer);
          reject(error);
        }
      });

      window.Android.fetchCannaCabanaPage(requestId, url);
    });
  }

  function buildApiUrl(page = 1) {
    const url = new URL('/api/product/filterv2', API_ORIGIN);
    const params = url.searchParams;
    params.set('collection', COLLECTION);
    params.set('price_min', '0');
    params.set('cbd_level_min', '0');
    params.set('cbd_level_max', '100');
    params.set('thc_level_min', String(THC_MIN));
    params.set('thc_level_max', String(THC_MAX));
    params.set('storeId', STORE_ID);
    params.set('page', String(page));
    params.set('limit', '100');
    params.set('sortOrder', 'asc');
    params.set('sortField', 'title');
    return url.toString();
  }

  function getVariantGrams(variant) {
    const pricing = variant?.pricing || {};
    const equivalent = numberOrNull(pricing.equivalent_g);
    if (equivalent != null && equivalent > 0) {
      return equivalent;
    }
    const title = normalizeText(variant?.title || '');
    const match = title.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?/i);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  function isQualifyingSize(grams) {
    if (grams == null) return false;
    return grams >= (MIN_SIZE_GRAMS - 0.1) && grams <= (MAX_SIZE_GRAMS + 0.1);
  }

  function getQualifyingVariants(product) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    return variants.filter(v => isQualifyingSize(getVariantGrams(v)));
  }

  function getStrainType(product) {
    const tags = Array.isArray(product?.tags) ? product.tags.map(normalizeText) : [];
    const lineage = tags.find(tag => /^lineage:/i.test(tag));
    const raw = lineage ? lineage.split(':').slice(1).join(':') : tags.find(tag => /^(indica|sativa|hybrid|blend)$/i.test(tag));
    if (!raw) return 'Unknown';
    const normalized = raw.toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function storeHasElitePrice(pricing) {
    const stores = normalizeText(pricing?.elite_stores || '');
    if (!stores) return true;
    return stores.split(',').map(value => value.trim()).includes(STORE_ID);
  }

  function normalizeCannaVariant(product, variant) {
    const grams = getVariantGrams(variant);
    if (!isQualifyingSize(grams)) {
      return { accepted: false, reason: 'wrong-size' };
    }

    const pricing = variant?.pricing || {};
    const thc = numberOrNull(pricing.thc_level);
    const qty = numberOrNull(pricing.qty_available);

    if (thc == null || thc < THC_MIN || thc > THC_MAX) {
      return { accepted: false, reason: 'thc' };
    }
    if (qty == null || qty <= 0) {
      return { accepted: false, reason: 'out-of-stock' };
    }

    const rawElite = numberOrNull(pricing.elite_price);
    const hasElite = rawElite != null && rawElite > 0 && storeHasElitePrice(pricing);
    const elitePrice = hasElite ? rawElite : null;

    const memberPrice = numberOrNull(pricing.member_price);
    const retailPrice = numberOrNull(pricing.retail_price);
    const regularPrice = (memberPrice != null && memberPrice > 0) ? memberPrice : retailPrice;

    const displayPrice = hasElite ? elitePrice : regularPrice;
    if (displayPrice == null || displayPrice <= 0) {
      return { accepted: false, reason: 'no-price' };
    }

    const handle = normalizeText(product?.handle || '');
    const sku = normalizeText(variant?.sku || variant?.id || product?.id || handle);
    const sizeLabel = normalizeText(variant?.title) || `${grams} G`;

    return {
      accepted: true,
      item: {
        id: `canna-${sku}`,
        sku,
        name: normalizeText(product?.title || 'Untitled whole flower'),
        vendor: normalizeText(product?.vendor || ''),
        strainType: getStrainType(product),
        thc,
        cbd: numberOrNull(pricing.cbd_level),
        hasElite,
        elitePrice,
        regularPrice,
        price: displayPrice,
        priceType: hasElite ? 'Elite' : 'Regular',
        sizeGrams: grams,
        sizeLabel,
        pricePerGram: round(displayPrice / grams, 2),
        qtyAvailable: qty,
        source: 'Canna Cabana',
        sourceUrl: handle ? `${SHOP_ORIGIN}/products/${encodeURIComponent(handle)}?sID=${STORE_ID}` : `${SHOP_ORIGIN}/collections/whole-flower?sID=${STORE_ID}`,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  function normalizeCannaProduct(product) {
    const qualifying = getQualifyingVariants(product);
    if (!qualifying.length) return { accepted: false, reason: 'wrong-size' };

    const items = [];
    let lastReason = 'unknown';
    for (const v of qualifying) {
      const res = normalizeCannaVariant(product, v);
      if (res.accepted) {
        items.push(res.item);
      } else {
        lastReason = res.reason;
      }
    }

    if (!items.length) {
      return { accepted: false, reason: lastReason };
    }

    // Sort: Elites first, then best value
    items.sort((a, b) => {
      if (a.hasElite !== b.hasElite) return a.hasElite ? -1 : 1;
      return a.pricePerGram - b.pricePerGram;
    });

    return {
      accepted: true,
      item: items[0],
      items
    };
  }

  async function fetchAllPages() {
    const rawProducts = [];
    let page = 1;
    let totalPages = 1;

    do {
      setStatus(`Fetching Canna Cabana inventory (14g–28g, ≥29% THC)… page ${page} of ${totalPages}.`);
      const response = await requestPage(buildApiUrl(page));
      let payload;
      try {
        payload = JSON.parse(response.body);
      } catch {
        throw new Error('Canna Cabana returned invalid JSON.');
      }

      if (!payload || !Array.isArray(payload.data) || !payload.pagination) {
        throw new Error('Canna Cabana returned an unexpected inventory response.');
      }
      rawProducts.push(...payload.data);

      totalPages = Math.max(1, Math.min(20, Number(payload.pagination.totalPages) || 1));
      page += 1;
    } while (page <= totalPages);

    return rawProducts;
  }

  function setStatus(message, isError = false) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.classList.toggle('error', isError);
  }

  function setFetching(value) {
    isFetching = value;
    if (els.button) {
      els.button.disabled = value;
      els.button.innerHTML = value
        ? 'Fetching Canna Cabana strains…'
        : '<svg><use href="#icon-refresh"></use></svg> Fetch Strains';
    }
    if (els.buttonMobile) {
      els.buttonMobile.disabled = value;
      els.buttonMobile.textContent = value ? 'Fetching Canna Cabana strains…' : 'Fetch Canna Cabana Strains';
    }
  }

  async function refreshCanna() {
    if (isFetching) return;
    setFetching(true);
    const previous = products;

    try {
      const raw = await fetchAllPages();
      const counts = {
        wrongSize: 0,
        thc: 0,
        soldOut: 0,
        noPrice: 0
      };
      const accepted = [];

      for (const product of raw) {
        const qualifyingVariants = getQualifyingVariants(product);
        if (qualifyingVariants.length === 0) {
          counts.wrongSize += 1;
          continue;
        }
        for (const variant of qualifyingVariants) {
          const parsed = normalizeCannaVariant(product, variant);
          if (parsed.accepted) {
            accepted.push(parsed.item);
          } else if (parsed.reason === 'thc') {
            counts.thc += 1;
          } else if (parsed.reason === 'out-of-stock') {
            counts.soldOut += 1;
          } else if (parsed.reason === 'no-price') {
            counts.noPrice += 1;
          }
        }
      }

      // Group and sort: ELITES FIRST, then regular strains (both sorted by price/value)
      products = [...new Map(accepted.map(item => [item.sku || item.id, item])).values()]
        .sort((a, b) => {
          // 1. Elites first
          if (a.hasElite !== b.hasElite) {
            return a.hasElite ? -1 : 1;
          }
          // 2. Lowest price / pricePerGram
          if (a.pricePerGram !== b.pricePerGram) {
            return a.pricePerGram - b.pricePerGram;
          }
          // 3. Highest THC
          if (b.thc !== a.thc) {
            return b.thc - a.thc;
          }
          // 4. Name alphabetical
          return a.name.localeCompare(b.name, 'en-CA', { sensitivity: 'base' });
        });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
      renderCanna();
      renderComparison();

      const eliteCount = products.filter(p => p.hasElite).length;
      const regularCount = products.length - eliteCount;

      setStatus(
        `Fetched ${products.length} whole-flower strains (14g–28g, ≥29% THC) at store 3658: ${eliteCount} with Elite pricing, ${regularCount} with regular member pricing.` +
        `${counts.soldOut ? ` ${counts.soldOut} out-of-stock excluded.` : ''}`
      );
    } catch (error) {
      products = previous;
      renderCanna();
      renderComparison();
      setStatus(error instanceof Error ? error.message : 'Unable to fetch Canna Cabana inventory.', true);
    } finally {
      setFetching(false);
    }
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 2
    }).format(value);
  }

  function renderCanna() {
    const eligible = products.filter(item =>
      item && item.price > 0 && item.qtyAvailable > 0 &&
      item.thc >= THC_MIN && item.thc <= THC_MAX &&
      isQualifyingSize(Number(item.sizeGrams))
    );

    // Sort: Elites first, then regular strains (both by pricePerGram, then THC, then name)
    eligible.sort((a, b) => {
      if (a.hasElite !== b.hasElite) {
        return a.hasElite ? -1 : 1;
      }
      if (a.pricePerGram !== b.pricePerGram) {
        return a.pricePerGram - b.pricePerGram;
      }
      if (b.thc !== a.thc) {
        return b.thc - a.thc;
      }
      return a.name.localeCompare(b.name, 'en-CA', { sensitivity: 'base' });
    });

    const eliteCount = eligible.filter(item => item.hasElite).length;
    const regularCount = eligible.length - eliteCount;

    if (els.count) {
      els.count.textContent = String(eligible.length);
    }
    if (els.bestValue) {
      const values = eligible.map(item => item.pricePerGram).filter(Number.isFinite);
      els.bestValue.textContent = values.length ? `$${Math.min(...values).toFixed(2)}/g` : '—';
    }
    if (els.highestThc) {
      const thc = eligible.map(item => item.thc).filter(Number.isFinite);
      els.highestThc.textContent = thc.length ? `${Math.max(...thc).toFixed(2)}%` : '—';
    }
    if (els.empty) els.empty.hidden = eligible.length > 0;
    if (!els.results) return;

    els.results.hidden = eligible.length === 0;
    els.results.innerHTML = eligible.map((item, index) => {
      const isElite = item.hasElite;
      const cardClass = isElite ? 'canna-card elite-card' : 'canna-card regular-card';
      const labelClass = isElite ? 'source-label' : 'source-label regular-label';
      const badgeText = isElite ? 'CANNA CABANA · ELITE' : 'CANNA CABANA · REGULAR';
      const priceTitle = isElite ? 'Elite price' : 'Regular price';
      const gTitle = isElite ? 'Elite $/g' : 'Regular $/g';
      const footNote = isElite
        ? 'Elite discount applied'
        : 'Regular member price (no Elite discount)';

      return `
        <article class="${cardClass}">
          <div class="source-card-head">
            <span class="rank source-rank">${index + 1}</span>
            <div>
              <p class="${labelClass}">${badgeText}</p>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.vendor || item.strainType)}${item.vendor && item.strainType !== 'Unknown' ? ` · ${escapeHtml(item.strainType)}` : ''}</p>
            </div>
          </div>
          <div class="common-facts">
            <div><span>THC</span><strong>${item.thc.toFixed(2)}%</strong></div>
            <div><span>Size</span><strong>${escapeHtml(item.sizeLabel || `${item.sizeGrams} G`)}</strong></div>
            <div><span>${priceTitle}</span><strong>${escapeHtml(formatMoney(item.price))}</strong></div>
            <div><span>${gTitle}</span><strong>$${item.pricePerGram.toFixed(2)}</strong></div>
          </div>
          <div class="source-card-foot">
            <span>${Math.round(item.qtyAvailable)} available at selected store</span>
            <span>${footNote}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function normalizeBulkForComparison(raw) {
    if (!raw || raw.available === false || raw.oneOunceAvailable !== true) return null;
    const price = numberOrNull(raw.oneOuncePrice);
    const min = numberOrNull(raw.thcMin);
    const max = numberOrNull(raw.thcMax);
    if (price == null || (min == null && max == null)) return null;
    const thc = min == null ? max : max == null ? min : round((min + max) / 2, 2);
    if (thc == null) return null;
    return {
      id: `bulk-${raw.sourceUrl || raw.name}`,
      name: normalizeText(raw.name || 'Untitled craft flower'),
      source: 'Bulk Buddy',
      sourceClass: 'bulk',
      strainType: normalizeText(raw.strainType || 'Unknown'),
      thc,
      thcDisplay: normalizeText(raw.thcDisplay || `${thc}%`),
      price,
      grams: 28.3495,
      pricePerGram: round(price / 28.3495, 2),
      priceLabel: '1 Ounce'
    };
  }

  function normalizeCannaForComparison(item) {
    if (!item || item.price <= 0 || item.qtyAvailable <= 0 || !Number.isFinite(item.thc)) return null;
    return {
      id: item.id,
      name: item.name,
      source: item.hasElite ? 'Canna Cabana (Elite)' : 'Canna Cabana',
      sourceClass: item.hasElite ? 'canna' : 'canna-regular',
      strainType: item.strainType,
      thc: item.thc,
      thcDisplay: `${item.thc.toFixed(2)}%`,
      price: item.price,
      grams: item.sizeGrams,
      pricePerGram: item.pricePerGram,
      priceLabel: `${item.sizeLabel || `${item.sizeGrams} G`} ${item.hasElite ? 'Elite' : 'Regular'}`
    };
  }

  function comparisonItems() {
    const bulk = readJson(BULK_STORAGE_KEY, []).map(normalizeBulkForComparison).filter(Boolean);
    const canna = products.map(normalizeCannaForComparison).filter(Boolean);
    return [...bulk, ...canna];
  }

  function renderComparison() {
    const items = comparisonItems();
    const sort = els.compareSort?.value || 'value';

    items.sort((a, b) => {
      if (sort === 'price') return a.price - b.price || b.thc - a.thc || a.name.localeCompare(b.name);
      if (sort === 'thc') return b.thc - a.thc || a.pricePerGram - b.pricePerGram || a.name.localeCompare(b.name);
      if (sort === 'name') return a.name.localeCompare(b.name, 'en-CA', { sensitivity: 'base' });
      return a.pricePerGram - b.pricePerGram || b.thc - a.thc || a.name.localeCompare(b.name);
    });

    const bulkCount = items.filter(item => item.source === 'Bulk Buddy').length;
    const cannaCount = items.filter(item => item.source.startsWith('Canna Cabana')).length;

    if (els.compareSummary) {
      els.compareSummary.textContent = items.length
        ? `${items.length} comparable available products · ${bulkCount} Bulk Buddy 1 oz · ${cannaCount} Canna Cabana`
        : 'Fetch one or both sources to build the common-field comparison.';
    }
    if (els.compareEmpty) els.compareEmpty.hidden = items.length > 0;
    if (!els.compareResults) return;

    els.compareResults.hidden = items.length === 0;
    els.compareResults.innerHTML = items.map((item, index) => `
      <article class="compare-card">
        <div class="compare-card-title">
          <span class="source-badge ${item.sourceClass}">${escapeHtml(item.source)}</span>
          <span class="compare-rank">#${index + 1}</span>
        </div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.strainType || 'Unknown')}</p>
        <div class="compare-facts">
          <div><span>THC</span><strong>${escapeHtml(item.thcDisplay)}</strong></div>
          <div><span>${escapeHtml(item.priceLabel)}</span><strong>${escapeHtml(formatMoney(item.price))}</strong></div>
          <div><span>Comparable $/g</span><strong>$${item.pricePerGram.toFixed(2)}</strong></div>
        </div>
      </article>
    `).join('');
  }

  window.CanShopCanna = {
    receivePage(requestId, url, body) {
      const request = pending.get(requestId);
      if (!request) return;
      pending.delete(requestId);
      request.resolve({ url, body });
    },
    receiveFetchError(requestId, message) {
      const request = pending.get(requestId);
      if (!request) return;
      pending.delete(requestId);
      request.reject(new Error(message));
    },
    refresh: refreshCanna,
    renderComparison,
    normalizeCannaProduct,
    normalizeCannaVariant,
    buildApiUrl,
    getVariantGrams,
    isQualifyingSize,
    getQualifyingVariants,
    choose28gVariant: (p) => getQualifyingVariants(p)[0] || null,
    getStrainType,
    storeHasElitePrice
  };

  els.button?.addEventListener('click', refreshCanna);
  els.buttonMobile?.addEventListener('click', refreshCanna);
  els.compareSort?.addEventListener('change', renderComparison);
  window.addEventListener('canshop:bulkbuddy-updated', renderComparison);
  window.addEventListener('canshop:canna-updated', () => {
    products = readJson(STORAGE_KEY, []);
    renderCanna();
    renderComparison();
  });

  renderCanna();
  renderComparison();
})();
