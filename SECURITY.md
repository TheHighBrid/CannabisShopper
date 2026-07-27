# Security policy

## Supported version

CanShop 1.0.x is the currently supported release line.

## Reporting

Do not publish exploitable security details in a public issue. Contact the repository owner privately through the GitHub profile associated with this repository and include reproduction steps, affected version, impact, and suggested mitigation when known.

## Security posture

CanShop intentionally avoids accounts, payments, advertising SDKs, analytics SDKs, location access, contacts, camera, microphone, storage permissions, and a remote application server. Manual product entries and preferences remain in local WebView storage.

The Android app blocks cleartext network traffic, external WebView navigation, mixed content, cookies, WebView debugging, backups, content access, and universal file URL access. Catalog requests use HTTPS, timeouts, and a maximum response size.

## Signing note

The GitHub sideload APK uses Android's debug signing configuration. This makes the first APK installable but is not appropriate for Play Store or managed enterprise distribution. A private release keystore must be protected outside the repository and supplied through protected CI secrets before production distribution.
