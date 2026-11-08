# CannabisShopper Repository Rules & Invariants

This document defines non-negotiable operational rules and architectural invariants for all AI agents and developers working on CannabisShopper.

---

## 1. Absolute User Data Preservation (Inviolable)
- **Data Primacy**: The user's historical dataset (e.g. 17+ saved fetch days of strain history, pricing, reviews, package quantities, lifespans, batch dates, and price drops) is the single most critical asset in this application.
- **No Data-Destructive Solutions**:
  - **NEVER** recommend or execute app uninstalls (`adb uninstall ca.canshop.app`) to solve install errors or certificate mismatches.
  - **NEVER** rename, duplicate, or branch the application package ID (such as `ca.canshop.app.v2` or `ca.canshop.app.debug`). The package identity MUST remain `ca.canshop.app`. Creating duplicate apps wastes user storage, doubles RAM consumption in background processes, and strands historical data in the old sandbox.
  - **NEVER** wipe local storage (`localStorage.clear()`, clearing app cache/data via OS settings) without an active, verified JSON backup file confirmed on disk.
- **Automated Backup & Recovery**:
  - Always maintain the auto-recovery mechanism: when local storage is empty, the app must automatically check for and restore from `/sdcard/Download/canshop-backup.json` (or internal backup storage via `Android.checkLocalBackupFile()`).

---

## 2. In-Place Update & Release Signing Invariant
- **Single Keystore Standard**:
  - All builds, local releases, and GitHub Actions CI releases MUST be signed using the unified release keystore (`canshop-release.jks`) with consistent credentials (`CANSHOP_KEYSTORE_BASE64`, `CANSHOP_KEY_ALIAS`).
  - Android package manager strictly enforces signature consistency during in-place updates. Mismatched signatures cause `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
- **In-Place Update Guarantee**:
  - Any new APK release MUST support seamless in-place installation via:
    ```bash
    adb install -r <path-to-apk>
    ```
    without losing application sandboxed data (`/data/data/ca.canshop.app/app_webview`).

---

## 3. Tool-First Autonomy & Strategic Problem Solving
- **Step Back & Analyze**:
  - Always evaluate requests from the complete perspective and final user objective rather than choosing a narrow, reactionary point of attack.
- **Autonomous Inspection Over User Burden**:
  - NEVER ask the user to manually copy, re-type, or take screenshots of dense, multi-day historical data.
  - Always use autonomous developer tools:
    - ADB shell commands (`adb shell dumpsys`, `adb shell pm`, `adb exec-out screencap`).
    - Chrome DevTools Protocol via forward socket (`adb forward tcp:9222 localabstract:webview_devtools_remote_*`).
    - Device and app logcat (`adb logcat`).
    - Node test suites (`npm test`).

---

## 4. Inventory Sourcing & Filtering Invariants

### A. Canna Cabana (Store 3658)
- **Target Category**: Whole Flower (`collection=whole-flower`).
- **Store ID**: Locked to `3658`.
- **Package Size Range**:
  - Minimum size: **14g**.
  - Maximum size: **28g**.
  - Inclusive of all intermediate sizes (e.g. 14g, 15g, 28g). Reject sizes $< 13.9\text{g}$ or $> 28.1\text{g}$.
- **Potency Threshold**:
  - **THC $\ge 29.0\%$**. No artificial upper bound cap.
- **Strict Sorting Invariant**:
  1. **Elite Pricing First**: All strains with active Elite pricing (`pricing.elite_price > 0`) MUST be ranked at the top with a gold badge (`CANNA CABANA · ELITE`).
  2. **Regular Member Pricing Second**: Strains without Elite pricing follow, using member or retail price, with a blue badge (`CANNA CABANA · REGULAR`).
  3. Within each group: Sort by lowest price per gram ($\$/\text{g}$), then highest THC percentage, then alphabetical title.

### B. Bulk Buddy
- Scrapes craft whole-flower offerings with lineage extraction, rating validation, and weighted scoring.
- Rejects non-flower formats and unavailable/out-of-stock items from the shortlist.

---

## 5. Verification Before Delivery
- Run the full test suite before any release or commit:
  ```bash
  npm test
  ```
- Ensure all 28+ test specifications pass, covering normalization, sizing boundaries, THC filtering, backup envelopes, and sorting order.
