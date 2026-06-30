# Compa Cana / CannabisShopper

Compa Cana is a craft cannabis flower ranking tool for legal adult-use cannabis research in Canada. It focuses on Bulk Buddy's craft cannabis flower category, filters out non-flower products, ranks the remaining craft flower listings, and can email the report.

## What it does

- Fetches the craft cannabis flower category.
- Filters to craft flower only.
- Excludes kief, hash, edibles, pre-rolls, vapes, extracts, CBD candy, and unrelated products.
- Ranks craft flower using visible listing signals:
  - product name
  - strain type
  - starting price
  - review rating
  - review volume
  - availability signal
- Ignores sitewide bulk discount banners.
- Uses the decision rule: prefer 3 oz variety unless a single quarter-pound strain is at least 12-15% cheaper per gram than the best 3 oz variety basket after the 35% bulk discount.
- Emails the report when SMTP settings are configured.

This is a research/comparison tool only. It does not make medical, safety, or purchase claims.

## CLI usage in Termux / Node

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run and email automatically:

```bash
npm start
```

Run without email:

```bash
npm run report
```

Run with saved offline HTML:

```bash
node dist/index.js --html-file ./bulkbuddy-craft-flowers.html
```

## Email setup for CLI

Use a Gmail App Password, not your normal Gmail password.

```bash
export SMTP_HOST="smtp.gmail.com"
export SMTP_PORT="465"
export SMTP_USER="lapeuffe@gmail.com"
export SMTP_PASS="your_16_character_google_app_password"
export EMAIL_FROM="lapeuffe@gmail.com"
export EMAIL_TO="lapeuffe@gmail.com"
```

Then run:

```bash
npm start
```

Never commit SMTP passwords, Gmail App Passwords, API keys, or `.env` files.

## Android APK

This repo now contains a native Android app in `app/`.

The APK app:

- fetches the craft flower category directly from the phone
- filters to craft flower only
- shows a readable ranked report in the app
- emails the report automatically after ranking if SMTP settings are saved
- stores SMTP settings in Android private app preferences

### Build APK with GitHub Actions

A workflow is included at:

```text
.github/workflows/android-apk.yml
```

To build the APK:

1. Open the repo on GitHub.
2. Go to **Actions**.
3. Open **Build Android APK**.
4. Click **Run workflow**.
5. Download the artifact named **compa-cana-debug-apk**.
6. Inside it, install `app-debug.apk` on your Android phone.

### Build APK locally with Gradle

If Android SDK and Gradle are installed:

```bash
gradle :app:assembleDebug
```

The APK will be created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Gmail note

Gmail SMTP requires a Google App Password for this kind of script/app. Your normal Gmail password will fail with `535-5.7.8 Username and Password not accepted`.

## Privacy note

The Android app stores SMTP settings in the app's private preferences. For stronger security, create a dedicated Gmail App Password for Compa Cana and revoke it if the phone is lost or the app is no longer used.
