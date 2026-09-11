(() => {
  'use strict';

  const PRODUCT_KEY = 'canshop.products.v3';
  const HISTORY_KEY = 'canshop.fetchHistory.v2';
  const LEGACY_HISTORY_KEY = 'canshop.fetchHistory.v1';
  const HISTORY_ENABLED_KEY = 'canshop.fetchHistory.enabled.v1';
  const MAX_HISTORY_DAYS = 60;
  const DAY_MS = 86_400_000;
  const PACKAGE_GRAMS = { ounce: 28.3495, quarterPound: 113.398 };

  const els = {
    enabled: document.querySelector('#historyEnabled'),
    save: document.querySelector('#saveSnapshotButton'),
    clear: document.querySelector('#clearHistoryButton'),
    status: document.querySelector('#historyStatus'),
    summary: document.querySelector('#weeklySummary'),
    chart: document.querySelector('#weeklyChart'),
    signals: document.querySelector('#weeklySignals'),
    predictions: document.querySelector('#restockPredictions'),
    appStatus: document.querySelector('#status')
  };

  if (!els.enabled || !els.save || !els.clear || !els.status || !els.summary || !els.chart || !els.signals || !els.predictions) {
    return;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function finiteOrNull(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const parts = String(key || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(value => !Number.isFinite(value))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }

  function daysBetween(startKey, endKey) {
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey);
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / DAY_MS);
  }

  function addDays(dateKey, days) {
    const date = parseDateKey(dateKey);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return normalizeDate(date);
  }

  function formatDay(dateKey, options = {}) {
    const date = parseDateKey(dateKey);
    if (!date) return dateKey;
    return new Intl.DateTimeFormat('en-CA', {
      month: options.long ? 'short' : undefined,
      day: options.long ? 'numeric' : undefined,
      weekday: options.weekday ? 'short' : undefined
    }).format(date);
  }

  function round(value, places = 2) {
    const power = 10 ** places;
    return Math.round(value * power) / power;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function selectedPrice(product) {
    const comparisonPrice = finiteOrNull(product.comparisonPrice);
    const comparisonGrams = finiteOrNull(product.comparisonGrams);
    if (comparisonPrice != null && comparisonGrams != null && comparisonGrams > 0) {
      return {
        packageKey: product.comparisonPackage === 'quarterPound' ? 'quarterPound' : 'ounce',
        price: comparisonPrice,
        grams: comparisonGrams,
        pricePerGram: round(comparisonPrice / comparisonGrams, 4)
      };
    }

    const packageKey = product.comparisonPackage === 'quarterPound' ? 'quarterPound' : 'ounce';
    const price = packageKey === 'quarterPound'
      ? finiteOrNull(product.quarterPoundPrice)
      : finiteOrNull(product.oneOuncePrice);
    const grams = PACKAGE_GRAMS[packageKey];
    return {
      packageKey,
      price,
      grams,
      pricePerGram: price == null ? null : round(price / grams, 4)
    };
  }

  function compactProduct(product) {
    const key = product.sourceUrl || String(product.name || '').trim().toLowerCase();
    if (!key) return null;
    const pricing = selectedPrice(product);
    return {
      key,
      name: String(product.name || 'Unnamed strain').trim(),
      strainType: String(product.strainType || product.type || 'Unknown').trim(),
      packageKey: pricing.packageKey,
      pricePerGram: pricing.pricePerGram,
      packagePrice: pricing.price,
      oneOuncePrice: finiteOrNull(product.oneOuncePrice),
      quarterPoundPrice: finiteOrNull(product.quarterPoundPrice),
      thcMin: finiteOrNull(product.thcMin),
      thcMax: finiteOrNull(product.thcMax),
      sourceUrl: product.sourceUrl || null
    };
  }

  function readHistory() {
    let raw = readJson(HISTORY_KEY, null);
    if (!Array.isArray(raw)) {
      const legacy = readJson(LEGACY_HISTORY_KEY, []);
      raw = Array.isArray(legacy) ? legacy : [];
      if (raw.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(raw));
    }
    return raw
      .filter(entry => entry && typeof entry.date === 'string' && Array.isArray(entry.items))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function writeHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY_DAYS)));
  }

  function productMap(snapshot) {
    return new Map((snapshot?.items || []).map(item => [item.key, item]));
  }

  function captureSnapshot(source = 'manual') {
    const products = readJson(PRODUCT_KEY, []);
    if (!Array.isArray(products) || !products.length) {
      setHistoryStatus('No verified fetched strains are available to save yet.', true);
      return false;
    }

    const items = products.map(compactProduct).filter(Boolean);
    if (!items.length) {
      setHistoryStatus('No valid fetched strain records were available to save.', true);
      return false;
    }

    const now = new Date();
    const date = normalizeDate(now);
    const history = readHistory().filter(entry => entry.date !== date);
    const packageKey = items[0]?.packageKey || 'ounce';
    history.push({
      date,
      capturedAt: now.toISOString(),
      source,
      packageKey,
      count: items.length,
      items
    });
    history.sort((a, b) => a.date.localeCompare(b.date));
    writeHistory(history);
    renderReport();
    setHistoryStatus(`Saved ${items.length} verified ${packageKey === 'quarterPound' ? 'Quarter Pound' : '1 Ounce'} strains for ${formatDay(date, { long: true })}.`);
    return true;
  }

  function setHistoryStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle('error', isError);
  }

  function lastCalendarDays(count) {
    const result = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      result.push(normalizeDate(date));
    }
    return result;
  }

  function getRestockEvents(history) {
    const events = [];
    const seenBefore = new Set();
    let previous = null;

    for (let snapshotIndex = 0; snapshotIndex < history.length; snapshotIndex += 1) {
      const snapshot = history[snapshotIndex];
      const currentMap = productMap(snapshot);
      const previousMap = productMap(previous);
      if (previous) {
        for (const [key, item] of currentMap) {
          if (!previousMap.has(key) && seenBefore.has(key)) {
            let lastSeen = null;
            for (let index = snapshotIndex - 1; index >= 0; index -= 1) {
              if (productMap(history[index]).has(key)) {
                lastSeen = history[index].date;
                break;
              }
            }
            const gapDays = lastSeen ? daysBetween(lastSeen, snapshot.date) : null;
            events.push({ key, name: item.name, date: snapshot.date, lastSeen, gapDays });
          }
        }
      }
      currentMap.forEach((_item, key) => seenBefore.add(key));
      previous = snapshot;
    }
    return events;
  }

  function historicalMedianPrice(history, key, packageKey) {
    const prices = [];
    for (const snapshot of history) {
      const item = productMap(snapshot).get(key);
      if (item?.packageKey === packageKey && item?.pricePerGram != null) prices.push(item.pricePerGram);
    }
    return median(prices);
  }

  function renderChart(history) {
    const byDate = new Map(history.map(entry => [entry.date, entry]));
    const days = lastCalendarDays(7);
    const values = days.map(day => byDate.get(day)?.count ?? null);
    const finiteValues = values.filter(value => value != null);
    const max = Math.max(1, ...finiteValues);

    els.chart.innerHTML = days.map((day, index) => {
      const value = values[index];
      const height = value == null ? 4 : Math.max(10, Math.round((value / max) * 100));
      const label = formatDay(day, { weekday: true });
      return `<div class="history-bar-column" title="${value == null ? 'No snapshot' : `${value} verified strains`}">
        <div class="history-bar-track">
          <span class="history-bar${value == null ? ' missing' : ''}" style="height:${height}%"></span>
        </div>
        <strong>${value == null ? '·' : value}</strong>
        <small>${label}</small>
      </div>`;
    }).join('');
  }

  function renderSignals(history) {
    const latest = history.at(-1);
    const previous = history.at(-2);
    if (!latest) {
      els.signals.innerHTML = '<p class="history-empty">Save a verified fetch snapshot to start building purchasing signals.</p>';
      return;
    }

    const currentMap = productMap(latest);
    const previousMap = productMap(previous);
    const priorSeen = new Set(history.slice(0, -1).flatMap(snapshot => snapshot.items.map(item => item.key)));
    const seenBeforePrevious = new Set(history.slice(0, -2).flatMap(snapshot => snapshot.items.map(item => item.key)));

    const newArrivals = [...currentMap.values()].filter(item => !priorSeen.has(item.key));
    const reappearances = previous
      ? [...currentMap.values()].filter(item => !previousMap.has(item.key) && seenBeforePrevious.has(item.key))
      : [];
    const priceDrops = previous
      ? [...currentMap.values()].map(item => {
          const before = previousMap.get(item.key);
          if (item.packageKey !== before?.packageKey || item.pricePerGram == null || before?.pricePerGram == null || item.pricePerGram >= before.pricePerGram) return null;
          return { ...item, drop: before.pricePerGram - item.pricePerGram, previous: before.pricePerGram };
        }).filter(Boolean).sort((a, b) => b.drop - a.drop)
      : [];

    const valueWatches = [...currentMap.values()].map(item => {
      if (item.pricePerGram == null) return null;
      const historical = historicalMedianPrice(history.slice(0, -1), item.key, item.packageKey);
      if (historical == null || historical <= 0) return null;
      const discount = (historical - item.pricePerGram) / historical;
      return discount >= 0.05 ? { ...item, historical, discount } : null;
    }).filter(Boolean).sort((a, b) => b.discount - a.discount);

    const cards = [
      {
        title: 'New arrivals',
        value: newArrivals.length,
        detail: newArrivals.slice(0, 3).map(item => item.name).join(' · ') || 'None detected'
      },
      {
        title: 'Reappearances',
        value: reappearances.length,
        detail: reappearances.slice(0, 3).map(item => item.name).join(' · ') || 'No returning strains detected'
      },
      {
        title: 'Price drops',
        value: priceDrops.length,
        detail: priceDrops.slice(0, 3).map(item => `${item.name} -$${item.drop.toFixed(2)}/g`).join(' · ') || 'No day-over-day drops'
      },
      {
        title: 'Value watch',
        value: valueWatches.length,
        detail: valueWatches.slice(0, 3).map(item => `${item.name} ${Math.round(item.discount * 100)}% below tracked median`).join(' · ') || 'Need more price history'
      }
    ];

    els.signals.innerHTML = cards.map(card => `<article class="history-signal-card">
      <span>${card.title}</span>
      <strong>${card.value}</strong>
      <small>${card.detail}</small>
    </article>`).join('');
  }

  function renderPredictions(history) {
    if (history.length < 3) {
      els.predictions.innerHTML = '<p class="history-empty">Restock forecasting needs at least 3 verified daily snapshots. More days produce better signals.</p>';
      return;
    }

    const events = getRestockEvents(history);
    const usableGaps = events.map(event => event.gapDays).filter(value => Number.isFinite(value) && value > 0);
    const globalGap = usableGaps.length >= 2 ? median(usableGaps) : null;
    const latest = history.at(-1);
    const currentKeys = new Set(latest.items.map(item => item.key));
    const latestByKey = new Map();
    const names = new Map();

    for (const snapshot of history) {
      for (const item of snapshot.items) {
        latestByKey.set(item.key, snapshot.date);
        names.set(item.key, item.name);
      }
    }

    const eventGapsByKey = new Map();
    for (const event of events) {
      if (!Number.isFinite(event.gapDays) || event.gapDays <= 0) continue;
      const list = eventGapsByKey.get(event.key) || [];
      list.push(event.gapDays);
      eventGapsByKey.set(event.key, list);
    }

    const candidates = [];
    for (const [key, lastSeen] of latestByKey) {
      if (currentKeys.has(key)) continue;
      const ownGaps = eventGapsByKey.get(key) || [];
      const expectedGap = ownGaps.length >= 2 ? median(ownGaps) : globalGap;
      if (expectedGap == null) continue;
      const predicted = addDays(lastSeen, Math.max(1, Math.round(expectedGap)));
      const overdueDays = predicted ? daysBetween(predicted, latest.date) : null;
      candidates.push({
        key,
        name: names.get(key) || 'Tracked strain',
        lastSeen,
        predicted,
        expectedGap,
        samples: ownGaps.length,
        overdueDays
      });
    }

    candidates.sort((a, b) => {
      const aDate = parseDateKey(a.predicted)?.getTime() ?? Infinity;
      const bDate = parseDateKey(b.predicted)?.getTime() ?? Infinity;
      return aDate - bDate;
    });

    const confidence = usableGaps.length >= 6 ? 'medium' : 'low';
    if (!candidates.length) {
      const note = usableGaps.length
        ? `Typical observed reappearance interval is about ${round(median(usableGaps), 1)} days, but no currently missing tracked strain has enough history for a useful forecast.`
        : 'No stock reappearance cycle has been observed yet. Keep daily snapshots enabled to build a usable pattern.';
      els.predictions.innerHTML = `<p class="history-empty">${note}</p>`;
      return;
    }

    els.predictions.innerHTML = `<div class="prediction-note">Forecast confidence: <strong>${confidence}</strong>. These are observational estimates, not retailer restock commitments.</div>` +
      candidates.slice(0, 5).map(item => {
        const timing = item.overdueDays != null && item.overdueDays > 0
          ? `Pattern window passed ${item.overdueDays} day${item.overdueDays === 1 ? '' : 's'} ago`
          : `Estimated around ${formatDay(item.predicted, { long: true })}`;
        return `<article class="prediction-row">
          <div><strong>${item.name}</strong><small>Last seen ${formatDay(item.lastSeen, { long: true })}</small></div>
          <div><span>${timing}</span><small>~${round(item.expectedGap, 1)} day observed interval${item.samples >= 2 ? ` · ${item.samples} strain-specific cycles` : ''}</small></div>
        </article>`;
      }).join('');
  }

  function renderSummary(history) {
    if (!history.length) {
      els.summary.innerHTML = '<article><strong>0</strong><span>saved days</span></article><article><strong>–</strong><span>latest inventory</span></article><article><strong>–</strong><span>weekly change</span></article><article><strong>–</strong><span>latest median $/g</span></article>';
      return;
    }

    const latest = history.at(-1);
    const weekAgoTarget = addDays(latest.date, -6);
    const comparable = history.filter(entry => (entry.packageKey || entry.items?.[0]?.packageKey) === (latest.packageKey || latest.items?.[0]?.packageKey));
    const weekStart = comparable.find(entry => entry.date >= weekAgoTarget) || comparable[0] || latest;
    const delta = latest.count - weekStart.count;
    const prices = latest.items.map(item => finiteOrNull(item.pricePerGram)).filter(value => value != null);
    const medianPrice = median(prices);
    const packageLabel = (latest.packageKey || latest.items?.[0]?.packageKey) === 'quarterPound' ? 'Quarter Pound' : '1 Ounce';

    els.summary.innerHTML = `
      <article><strong>${history.length}</strong><span>saved day${history.length === 1 ? '' : 's'}</span></article>
      <article><strong>${latest.count}</strong><span>latest ${packageLabel}</span></article>
      <article><strong>${delta > 0 ? '+' : ''}${delta}</strong><span>7-day inventory change</span></article>
      <article><strong>${medianPrice == null ? '–' : `$${medianPrice.toFixed(2)}`}</strong><span>latest median $/g</span></article>`;
  }

  function renderReport() {
    const history = readHistory();
    renderSummary(history);
    renderChart(history);
    renderSignals(history);
    renderPredictions(history);

    if (!history.length) {
      setHistoryStatus(els.enabled.checked
        ? 'Daily logging is on. The next complete verified fetch will create the first snapshot.'
        : 'Daily logging is off. Turn it on or save a verified snapshot manually.');
      return;
    }

    const latest = history.at(-1);
    const packageLabel = (latest.packageKey || latest.items?.[0]?.packageKey) === 'quarterPound' ? 'Quarter Pound' : '1 Ounce';
    setHistoryStatus(`Latest snapshot: ${formatDay(latest.date, { long: true })}, ${latest.count} verified ${packageLabel} strains. History is stored only on this device.`);
  }

  els.enabled.checked = localStorage.getItem(HISTORY_ENABLED_KEY) === 'true';
  els.enabled.addEventListener('change', () => {
    localStorage.setItem(HISTORY_ENABLED_KEY, String(els.enabled.checked));
    setHistoryStatus(els.enabled.checked
      ? 'Daily logging enabled. Only complete verified fetches will update the daily snapshot.'
      : 'Daily logging disabled. Existing history is preserved.');
  });

  els.save.addEventListener('click', () => captureSnapshot('manual'));
  els.clear.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LEGACY_HISTORY_KEY);
    renderReport();
    setHistoryStatus('Saved fetch history cleared. Current strain results were not changed.');
  });

  if (els.appStatus) {
    const observer = new MutationObserver(() => {
      const message = String(els.appStatus.textContent || '').trim();
      if (!message.startsWith('Fetched ')) return;
      if (localStorage.getItem(HISTORY_ENABLED_KEY) === 'true') captureSnapshot('automatic-fetch');
    });
    observer.observe(els.appStatus, { childList: true, characterData: true, subtree: true });
  }

  window.CanShopHistory = {
    captureSnapshot,
    readHistory,
    renderReport
  };

  renderReport();
})();
