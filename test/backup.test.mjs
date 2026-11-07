import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadBackupModule(mockLocalStorage = {}, mockAndroid = null) {
  const code = readFileSync('app/src/main/assets/backup.js', 'utf8');

  const events = [];
  const fakeWindow = {
    Android: mockAndroid,
    addEventListener: () => {},
    dispatchEvent: (event) => events.push(event)
  };

  const fakeDocument = {
    querySelector: () => null,
    createElement: () => ({
      style: {},
      click: () => {},
      appendChild: () => {},
      removeChild: () => {},
      select: () => {}
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {}
    }
  };

  const storage = { ...mockLocalStorage };
  const fakeLocalStorage = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, val) => { storage[key] = String(val); },
    removeItem: (key) => { delete storage[key]; }
  };

  const sandbox = {
    window: fakeWindow,
    document: fakeDocument,
    localStorage: fakeLocalStorage,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    Blob: class Blob {},
    URL: {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {}
    },
    setTimeout: (fn) => fn(),
    navigator: {},
    console,
    module: { exports: {} }
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  return {
    module: sandbox.window.CanShopBackup || sandbox.module.exports,
    storage,
    events
  };
}

test('buildBackupPayload creates correct envelope with all keys', () => {
  const mockStorage = {
    'canshop.products.v3': JSON.stringify([{ id: 'bb-1', name: 'Pink Kush' }]),
    'canshop.cannacabana.v1': JSON.stringify([{ id: 'cc-1', name: 'Chopper Pick' }]),
    'canshop.preferences.v1': JSON.stringify({ targetThc: 30 }),
    'canshop.history.v1': JSON.stringify([{ date: '2026-11-05' }]),
    'canshop.history.enabled': 'true'
  };

  const { module } = loadBackupModule(mockStorage);
  const payload = module.buildBackupPayload();

  assert.equal(payload.canshop_backup_version, 1);
  assert.equal(payload.app_version, '2.1.0');
  assert.ok(payload.exported_at);
  assert.equal(payload.data.products.length, 1);
  assert.equal(payload.data.products[0].name, 'Pink Kush');
  assert.equal(payload.data.cannacabana.length, 1);
  assert.equal(payload.data.cannacabana[0].name, 'Chopper Pick');
  assert.equal(payload.data.preferences.targetThc, 30);
  assert.equal(payload.data.history.length, 1);
  assert.equal(payload.data.history_enabled, true);
});

test('parseBackup parses envelope JSON correctly', () => {
  const { module } = loadBackupModule();
  const input = JSON.stringify({
    canshop_backup_version: 1,
    data: {
      products: [{ id: 1, name: 'Strain A' }],
      cannacabana: [{ id: 2, name: 'Strain B', elitePrice: 110 }],
      preferences: { comparisonPackage: 'ounce' },
      history: [{ date: '2026-11-05' }],
      history_enabled: true
    }
  });

  const parsed = module.parseBackup(input);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.cannacabana.length, 1);
  assert.equal(parsed.preferences.comparisonPackage, 'ounce');
  assert.equal(parsed.history.length, 1);
  assert.equal(parsed.history_enabled, true);
});

test('parseBackup accepts direct object with products and cannacabana', () => {
  const { module } = loadBackupModule();
  const input = JSON.stringify({
    products: [{ name: 'Direct Strain' }],
    cannacabana: [{ name: 'Direct Canna', elitePrice: 99 }]
  });

  const parsed = module.parseBackup(input);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].name, 'Direct Strain');
  assert.equal(parsed.cannacabana.length, 1);
  assert.equal(parsed.preferences, null);
});

test('parseBackup identifies raw product array', () => {
  const { module } = loadBackupModule();
  const rawArray = JSON.stringify([{ id: 1, name: 'Bulk Strain' }]);

  const parsed = module.parseBackup(rawArray);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].name, 'Bulk Strain');
  assert.equal(parsed.cannacabana, null);
});

test('parseBackup identifies raw cannacabana array by elitePrice', () => {
  const { module } = loadBackupModule();
  const rawArray = JSON.stringify([{ id: 10, name: 'Canna Strain', elitePrice: 85 }]);

  const parsed = module.parseBackup(rawArray);
  assert.equal(parsed.cannacabana.length, 1);
  assert.equal(parsed.cannacabana[0].name, 'Canna Strain');
  assert.equal(parsed.products, null);
});

test('parseBackup rejects invalid json and empty data', () => {
  const { module } = loadBackupModule();
  assert.throws(() => module.parseBackup('{ broken json'), /Invalid JSON/);
  assert.throws(() => module.parseBackup(''), /Please select a file or paste backup JSON/);
  assert.throws(() => module.parseBackup('{"randomKey": 123}'), /No valid CanShop products/);
});

test('applyBackup persists to localStorage and fires events', () => {
  const { module, storage, events } = loadBackupModule();
  const validated = {
    products: [{ id: 101, name: 'Gelato' }],
    cannacabana: [{ id: 202, name: 'Galactic Jack', elitePrice: 120 }],
    preferences: { targetThc: 29.5 },
    history: [{ date: '2026-11-05' }],
    history_enabled: true
  };

  const result = module.applyBackup(validated);
  assert.ok(result.success);
  assert.equal(result.counts.products, 1);
  assert.equal(result.counts.cannacabana, 1);
  assert.equal(result.counts.history, 1);
  assert.equal(result.counts.hasPreferences, true);

  assert.equal(JSON.parse(storage['canshop.products.v3']).length, 1);
  assert.equal(JSON.parse(storage['canshop.cannacabana.v1']).length, 1);
  assert.equal(JSON.parse(storage['canshop.preferences.v1']).targetThc, 29.5);
  assert.equal(storage['canshop.history.enabled'], 'true');

  const eventTypes = events.map(e => e.type);
  assert.ok(eventTypes.includes('canshop:backup-restored'));
  assert.ok(eventTypes.includes('canshop:bulkbuddy-updated'));
  assert.ok(eventTypes.includes('canshop:canna-updated'));
  assert.ok(eventTypes.includes('canshop:history-updated'));
});
