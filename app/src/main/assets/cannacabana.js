(() => {
  'use strict';

  const STORAGE_KEY = 'canshop.cannacabana.v1';
  const BULK_STORAGE_KEY = 'canshop.products.v3';
  const API_ORIGIN = 'https://app.cannacabana.com';
  const SHOP_ORIGIN = 'https://cannacabana.com';
  const STORE_ID = '3658';
  const COLLECTION = 'whole-flower';
  const SIZE_LABEL = '28 G';
  const SIZE_GRAMS = 28;
  const THC_MIN = 29.97;
  const THC_MAX = 34.97;
  const REQUEST_TIMEOUT_MS = 70_000;
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
        reject(new Error('Canna Cabana request timed out.'));
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
    params.set('selectedOptions', SIZE_LABEL);
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
    params.set('priceType', 'elite_price');
    return url.toString();
  }

  function is28gVariant(variant) {
    const pricing = variant?.pricing || {};
    const equivalent = numberOrNull(pricing.equivalent_g);
    const title = normalizeText(variant?.title || '');
    return (equivalent != null && Math.abs(equivalent - SIZE_GRAMS) < 0.05)
      || /^28\s*g(?:rams?)?$/i.test(title);
  }

  function choose28gVariant(product) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    return variants.find(is28gVariant) || null;
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

  function normalizeCannaProduct(product) {
    const variant = choose28gVariant(product);
    if (!variant) return { accepted: false, reason: 'wrong-size' };

    const pricing = variant.pricing || {};
    const thc = numberOrNull(pricing.thc_level);
    const elitePrice = numberOrNull(pricing.elite_price);
    const qty = numberOrNull(pricing.qty_available);
    const exactSize = numberOrNull(pricing.equivalent_g);

    if (exactSize != null && Math.abs(exactSize - SIZE_GRAMS) >= 0.05) {
      return { accepted: false, reason: 'wrong-size' };
    }
    if (thc == null || thc < THC_MIN || thc > THC_MAX) {
      return { accepted: false, reason: 'thc' };
    }
    if (elitePrice == null || elitePrice <= 0 || pricing.is_elite === false || !storeHasElitePrice(pricing)) {
      return { accepted: false, reason: 'no-elite-price' };
    }
    if (qty == null || qty <= 0) {
      return { accepted: false, reason: 'out-of-stock' };
    }

    const handle = normalizeText(product?.handle || '');
    const sku = normalizeText(variant?.sku || variant?.id || product?.id || handle);
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
        elitePrice,
        sizeGrams: SIZE_GRAMS,
        pricePerGram: round(elitePrice / SIZE_GRAMS, 2),
        qtyAvailable: qty,
        source: 'Canna Cabana',
        sourceUrl: handle ? `${SHOP_ORIGIN}/products/${encodeURIComponent(handle)}?sID=${STORE_ID}` : `${SHOP_ORIGIN}/collections/whole-flower?sID=${STORE_ID}`,
        fetchedAt: new Date().toISOString()
      }
    };
  }

  async function fetchAllPages() {
    const rawProducts = [];
    let page = 1;
    let totalPages = 1;

    do {
      setStatus(`Fetching Canna Cabana Elite 28g inventory… page ${page} of ${totalPages}.`);
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
        ? 'Fetching Elite 28g inventory…'
        : '<svg><use href="#icon-refresh"></use></svg> Fetch Elite';
    }
    if (els.buttonMobile) {
      els.buttonMobile.disabled = value;
      els.buttonMobile.textContent = value ? 'Fetching Elite 28g inventory…' : 'Fetch Canna Cabana Elite';
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
        noElite: 0,
        soldOut: 0
      };
      const accepted = [];

      for (const product of raw) {
        const parsed = normalizeCannaProduct(product);
        if (parsed.accepted) {
          accepted.push(parsed.item);
          continue;
        }
        if (parsed.reason === 'wrong-size') counts.wrongSize += 1;
        else if (parsed.reason === 'thc') counts.thc += 1;
        else if (parsed.reason === 'no-elite-price') counts.noElite += 1;
        else if (parsed.reason === 'out-of-stock') counts.soldOut += 1;
      }

      products = [...new Map(accepted.map(item => [item.sku || item.id, item])).values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'en-CA', { sensitivity: 'base' }));

      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
      renderCanna();
      renderComparison();
      setStatus(
        `Fetched ${products.length} available Elite-priced 28g Whole Flower product${products.length === 1 ? '' : 's'} at store 3658 within ${THC_MIN.toFixed(2)}–${THC_MAX.toFixed(2)}% THC.` +
        ` Market/member prices ignored.${counts.noElite ? ` ${counts.noElite} non-Elite result${counts.noElite === 1 ? '' : 's'} excluded.` : ''}` +
        `${counts.soldOut ? ` ${counts.soldOut} out-of-stock result${counts.soldOut === 1 ? '' : 's'} excluded.` : ''}`
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
      item && item.elitePrice > 0 && item.qtyAvailable > 0 &&
      item.thc >= THC_MIN && item.thc <= THC_MAX &&
      Math.abs(Number(item.sizeGrams) - SIZE_GRAMS) < 0.05
    );

    if (els.count) els.count.textContent = String(eligible.length);
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
    els.results.innerHTML = eligible
      .sort((a, b) => a.elitePrice - b.elitePrice || b.thc - a.thc || a.name.localeCompare(b.name))
      .map((item, index) => `
        <article class="canna-card">
          <div class="source-card-head">
            <span class="rank source-rank">${index + 1}</span>
            <div>
              <p class="source-label">CANNA CABANA · ELITE</p>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.vendor || item.strainType)}${item.vendor && item.strainType !== 'Unknown' ? ` · ${escapeHtml(item.strainType)}` : ''}</p>
            </div>
          </div>
          <div class="common-facts">
            <div><span>THC</span><strong>${item.thc.toFixed(2)}%</strong></div>
            <div><span>Size</span><strong>28 G</strong></div>
            <div><span>Elite price</span><strong>${escapeHtml(formatMoney(item.elitePrice))}</strong></div>
            <div><span>Elite $/g</span><strong>$${item.pricePerGram.toFixed(2)}</strong></div>
          </div>
          <div class="source-card-foot">
            <span>${Math.round(item.qtyAvailable)} available at selected store</span>
            <span>Market price ignored</span>
          </div>
        </article>
      `).join('');
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
    if (!item || item.elitePrice <= 0 || item.qtyAvailable <= 0 || !Number.isFinite(item.thc)) return null;
    return {
      id: item.id,
      name: item.name,
      source: 'Canna Cabana',
      sourceClass: 'canna',
      strainType: item.strainType,
      thc: item.thc,
      thcDisplay: `${item.thc.toFixed(2)}%`,
      price: item.elitePrice,
      grams: SIZE_GRAMS,
      pricePerGram: item.pricePerGram,
      priceLabel: '28 G Elite'
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
    const cannaCount = items.filter(item => item.source === 'Canna Cabana').length;

    if (els.compareSummary) {
      els.compareSummary.textContent = items.length
        ? `${items.length} comparable available products · ${bulkCount} Bulk Buddy 1 oz · ${cannaCount} Canna Cabana Elite 28g`
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
    renderComparison
  };

  els.button?.addEventListener('click', refreshCanna);
  els.buttonMobile?.addEventListener('click', refreshCanna);
  els.compareSort?.addEventListener('change', renderComparison);
  window.addEventListener('canshop:bulkbuddy-updated', renderComparison);

  renderCanna();
  renderComparison();
})();
