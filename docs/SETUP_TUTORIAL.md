# CanShop v1.00 setup tutorial

## 1. Install the published APK

1. Open the GitHub release named **CanShop v1.00**.
2. Download `CanShop-v1.00.apk` and `CanShop-v1.00.apk.sha256`.
3. Verify the checksum with a trusted SHA-256 utility.
4. On Android, allow installation from the browser or file manager used for the download.
5. Install the APK and open CanShop.
6. Confirm that you are of legal cannabis age in your province or territory.

## 2. Use the app

- Tap the refresh icon to request the configured public craft-flower category.
- Use **Add product** when a live page omits fields or cannot be parsed.
- Use **Research preferences** to set target THC, maximum listed price per gram, terpene words, and availability filtering.
- Use **Load sample set** only for demonstration. Every fictional record is visibly labelled.
- Remove individual records or clear the full on-device notebook at any time.

CanShop excludes non-flower formats and ignores sale or discount badges in the value score. It is a research comparator, not a storefront.

## 3. Build from source

### Prerequisites

- Git
- Node.js 20 or newer
- Java 17
- Android SDK Platform 35
- Android Build Tools 35.0.0
- Gradle 8.7

### Commands

```bash
git clone https://github.com/TheHighBrid/CannabisShopper.git
cd CannabisShopper
npm install
npm run check
npm run build
gradle clean assembleRelease
```

The resulting APK is located at:

```text
app/build/outputs/apk/release/app-release.apk
```

## 4. GitHub release automation

The workflow in `.github/workflows/webpack.yml` validates the TypeScript CLI and web assets, builds the Android release APK, generates a SHA-256 file, uploads both as workflow artifacts, and publishes or refreshes tag `v1.0.0` when `main` is updated.

## 5. Production signing upgrade

The public GitHub sideload build uses Android's debug signing configuration so the APK is immediately installable. Before Play Store distribution, replace `signingConfig signingConfigs.debug` in `app/build.gradle` with a private release keystore supplied through protected GitHub Actions secrets. Never commit a production private key.
