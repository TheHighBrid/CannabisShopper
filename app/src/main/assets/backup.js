(() => {
  'use strict';

  const PRODUCTS_KEY = 'canshop.products.v3';
  const CANNA_KEY = 'canshop.cannacabana.v1';
  const PREFS_KEY = 'canshop.preferences.v3';
  const LEGACY_PREFS_KEY = 'canshop.preferences.v1';
  const HISTORY_KEY = 'canshop.fetchHistory.v2';
  const LEGACY_HISTORY_KEY = 'canshop.history.v1';
  const HISTORY_ENABLED_KEY = 'canshop.fetchHistory.enabled.v1';
  const LEGACY_HISTORY_ENABLED_KEY = 'canshop.history.enabled';
  const AGE_KEY = 'canshop.legalAgeConfirmed.v1';
  const PREFS_MIGRATION_KEY = 'canshop.preferences.neutralized.v1';
  const BACKUP_FORMAT_VERSION = 1;

  const els = {
    exportButton: document.querySelector('#exportBackupButton'),
    restoreButton: document.querySelector('#openRestoreDialogButton'),
    copyButton: document.querySelector('#copyBackupButton'),
    backupStatus: document.querySelector('#backupStatus'),
    restoreDialog: document.querySelector('#restoreDialog'),
    closeRestoreDialog: document.querySelector('#closeRestoreDialog'),
    cancelRestoreButton: document.querySelector('#cancelRestoreButton'),
    applyRestoreButton: document.querySelector('#applyRestoreButton'),
    fileInput: document.querySelector('#backupFileInput'),
    restoreText: document.querySelector('#restoreJsonText')
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function setStatus(message, isError = false) {
    if (!els.backupStatus) return;
    els.backupStatus.textContent = message;
    els.backupStatus.classList.toggle('error', isError);
  }

  function buildBackupPayload() {
    const appVersion = (typeof window !== 'undefined' && window.Android?.appVersion?.()) || '2.1.0';
    const prefs = readJson(PREFS_KEY, null) ?? readJson(LEGACY_PREFS_KEY, null);
    const history = readJson(HISTORY_KEY, null) ?? readJson(LEGACY_HISTORY_KEY, []);
    const historyEnabled =
      localStorage.getItem(HISTORY_ENABLED_KEY) === 'true' ||
      localStorage.getItem(LEGACY_HISTORY_ENABLED_KEY) === 'true';

    return {
      canshop_backup_version: BACKUP_FORMAT_VERSION,
      app_version: appVersion,
      exported_at: new Date().toISOString(),
      data: {
        products: readJson(PRODUCTS_KEY, []),
        cannacabana: readJson(CANNA_KEY, []),
        preferences: prefs,
        history: Array.isArray(history) ? history : [],
        history_enabled: historyEnabled
      }
    };
  }

  function exportBackup() {
    try {
      const payload = buildBackupPayload();
      const jsonString = JSON.stringify(payload, null, 2);

      // Offer native Android share sheet if available
      if (typeof window !== 'undefined' && window.Android?.shareBackup) {
        window.Android.shareBackup(jsonString);
      }

      // Always initiate browser/webview file download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `canshop-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const productCount = payload.data.products.length;
      const cannaCount = payload.data.cannacabana.length;
      setStatus(`Backup exported successfully (${productCount} Bulk Buddy, ${cannaCount} Canna Cabana strains).`);
      return true;
    } catch (error) {
      setStatus(`Unable to export backup: ${error instanceof Error ? error.message : String(error)}`, true);
      return false;
    }
  }

  function copyBackupToClipboard() {
    try {
      const payload = buildBackupPayload();
      const jsonString = JSON.stringify(payload, null, 2);

      if (typeof window !== 'undefined' && window.Android?.copyToClipboard) {
        window.Android.copyToClipboard(jsonString);
        setStatus('Backup copied to clipboard! Save or send it anywhere.');
        return true;
      }

      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(jsonString).then(
          () => setStatus('Backup copied to clipboard! Save or send it anywhere.'),
          () => fallbackCopy(jsonString)
        );
        return true;
      }

      fallbackCopy(jsonString);
      return true;
    } catch (error) {
      setStatus(`Unable to copy backup: ${error instanceof Error ? error.message : String(error)}`, true);
      return false;
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      setStatus('Backup copied to clipboard!');
    } catch {
      setStatus('Could not copy automatically. Select and copy from the restore box.', true);
    } finally {
      document.body.removeChild(area);
    }
  }

  function parseBackup(input) {
    if (!input) {
      throw new Error('Please select a file or paste backup JSON.');
    }

    let parsed;
    if (typeof input === 'string') {
      try {
        parsed = JSON.parse(input.trim());
      } catch (err) {
        throw new Error('Invalid JSON format: ' + (err instanceof Error ? err.message : String(err)));
      }
    } else if (typeof input === 'object' && input !== null) {
      parsed = input;
    } else {
      throw new Error('Invalid backup data format.');
    }

    // Support both wrapped format { data: { products, ... } } and direct format { products, ... }
    const source = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    const result = {
      products: null,
      cannacabana: null,
      preferences: null,
      history: null,
      history_enabled: null
    };

    // If root is directly an array, check if it is products or cannacabana
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        result.products = [];
      } else if (parsed[0] && ('elitePrice' in parsed[0] || 'elite_price' in parsed[0])) {
        result.cannacabana = parsed;
      } else {
        result.products = parsed;
      }
    } else {
      if (Array.isArray(source.products)) {
        result.products = source.products;
      }
      if (Array.isArray(source.cannacabana)) {
        result.cannacabana = source.cannacabana;
      } else if (Array.isArray(source.canna)) {
        result.cannacabana = source.canna;
      }
      if (source.preferences && typeof source.preferences === 'object') {
        result.preferences = source.preferences;
      }
      if (Array.isArray(source.history)) {
        result.history = source.history;
      } else if (Array.isArray(source.fetchHistory)) {
        result.history = source.fetchHistory;
      } else if (Array.isArray(source.fetch_history)) {
        result.history = source.fetch_history;
      }
      if (typeof source.history_enabled === 'boolean') {
        result.history_enabled = source.history_enabled;
      } else if (typeof source.historyEnabled === 'boolean') {
        result.history_enabled = source.historyEnabled;
      }
    }

    const hasAnyData =
      result.products !== null ||
      result.cannacabana !== null ||
      result.preferences !== null ||
      result.history !== null;

    if (!hasAnyData) {
      throw new Error('No valid CanShop products, Canna Cabana strains, preferences, or history found in the backup.');
    }

    return result;
  }

  function applyBackup(validated) {
    const counts = {
      products: 0,
      cannacabana: 0,
      history: 0,
      hasPreferences: false
    };

    if (Array.isArray(validated.products)) {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(validated.products));
      counts.products = validated.products.length;
    }

    if (Array.isArray(validated.cannacabana)) {
      localStorage.setItem(CANNA_KEY, JSON.stringify(validated.cannacabana));
      counts.cannacabana = validated.cannacabana.length;
    }

    if (validated.preferences && typeof validated.preferences === 'object') {
      localStorage.setItem(PREFS_KEY, JSON.stringify(validated.preferences));
      localStorage.setItem(LEGACY_PREFS_KEY, JSON.stringify(validated.preferences));
      localStorage.setItem(PREFS_MIGRATION_KEY, 'true');
      counts.hasPreferences = true;
    }

    if (Array.isArray(validated.history)) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(validated.history));
      localStorage.setItem(LEGACY_HISTORY_KEY, JSON.stringify(validated.history));
      counts.history = validated.history.length;
    }

    if (typeof validated.history_enabled === 'boolean') {
      localStorage.setItem(HISTORY_ENABLED_KEY, String(validated.history_enabled));
      localStorage.setItem(LEGACY_HISTORY_ENABLED_KEY, String(validated.history_enabled));
    }

    localStorage.setItem(AGE_KEY, 'true');

    // Trigger cross-module updates
    window.dispatchEvent(new CustomEvent('canshop:backup-restored', { detail: counts }));
    window.dispatchEvent(new CustomEvent('canshop:bulkbuddy-updated'));
    window.dispatchEvent(new CustomEvent('canshop:canna-updated'));
    window.dispatchEvent(new CustomEvent('canshop:history-updated'));

    const parts = [];
    if (counts.products > 0) parts.push(`${counts.products} Bulk Buddy strain${counts.products === 1 ? '' : 's'}`);
    if (counts.cannacabana > 0) parts.push(`${counts.cannacabana} Canna Cabana strain${counts.cannacabana === 1 ? '' : 's'}`);
    if (counts.hasPreferences) parts.push('search preferences');
    if (counts.history > 0) parts.push(`${counts.history} history log${counts.history === 1 ? '' : 's'}`);

    const message = `Restored ${parts.length ? parts.join(', ') : 'data'} successfully.`;
    setStatus(message);
    return { success: true, message, counts };
  }

  function restoreFromText(text) {
    const validated = parseBackup(text);
    return applyBackup(validated);
  }

  // Event Listeners
  if (els.exportButton) {
    els.exportButton.addEventListener('click', exportBackup);
  }

  if (els.copyButton) {
    els.copyButton.addEventListener('click', copyBackupToClipboard);
  }

  if (els.restoreButton && els.restoreDialog) {
    els.restoreButton.addEventListener('click', () => {
      if (els.restoreText) els.restoreText.value = '';
      if (els.fileInput) els.fileInput.value = '';
      els.restoreDialog.showModal();
    });
  }

  if (els.closeRestoreDialog && els.restoreDialog) {
    els.closeRestoreDialog.addEventListener('click', () => els.restoreDialog.close());
  }

  if (els.cancelRestoreButton && els.restoreDialog) {
    els.cancelRestoreButton.addEventListener('click', () => els.restoreDialog.close());
  }

  if (els.fileInput) {
    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = event => {
        const text = String(event.target?.result || '');
        if (els.restoreText) els.restoreText.value = text;
      };
      reader.readAsText(file);
    });
  }

  if (els.applyRestoreButton) {
    els.applyRestoreButton.addEventListener('click', () => {
      const text = els.restoreText?.value || '';
      try {
        const result = restoreFromText(text);
        if (els.restoreDialog) els.restoreDialog.close();
        setStatus(result.message);
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
      }
    });
  }

  // Automatic migration/recovery on fresh install if backup file is present in app storage
  function checkAndAutoRestore() {
    try {
      const hasHistory = !!localStorage.getItem(HISTORY_KEY);
      const hasProducts = !!localStorage.getItem(PRODUCTS_KEY);
      if (hasHistory || hasProducts) return;

      if (typeof window !== 'undefined' && window.Android?.checkLocalBackupFile) {
        const backupJson = window.Android.checkLocalBackupFile();
        if (backupJson && typeof backupJson === 'string' && backupJson.trim().length > 10) {
          const res = restoreFromText(backupJson);
          if (res?.success) {
            console.log('Automatically recovered CanShop research history and products from local storage.');
          }
        }
      }
    } catch (e) {
      console.warn('Auto restore check skipped:', e);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkAndAutoRestore);
    } else if (typeof setTimeout !== 'undefined') {
      setTimeout(checkAndAutoRestore, 100);
    } else {
      checkAndAutoRestore();
    }
  }

  // Expose for unit testing and developer console
  if (typeof window !== 'undefined') {
    window.CanShopBackup = {
      buildBackupPayload,
      exportBackup,
      copyBackupToClipboard,
      parseBackup,
      applyBackup,
      restoreFromText
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildBackupPayload,
      parseBackup,
      applyBackup,
      restoreFromText
    };
  }
})();
