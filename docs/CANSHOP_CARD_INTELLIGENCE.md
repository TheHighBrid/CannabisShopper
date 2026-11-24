# CanShop card intelligence: phase 1

This change adds a read-only evidence interpretation layer to the Android listing cards. It does not change collection, filters, sorting, scoring, package identity, backups, storage keys or the age gate. No network request or new dependency is introduced.

## Data semantics
- Review ratings are reported listing data, not verified quality or safety.
- A small sample is flagged below 10 reviews. Missing values are not converted into zero.
- A batch date is an age observation, not shelf life, storage quality or expiry.
- The stale snapshot threshold is seven days. This describes observation age only.
- CanShop's existing source-specific comparison score is not an all-time quality rating.
- Canna Cabana cards explicitly disclose absent comparable review/batch fields.

## Reserved awards
The custom codes +1, +2, +212, +57, +93 and +213 are reserved for the requested global ranking rules. +93 is a user-defined code, not a Jamaican telephone prefix. No award is assigned yet: retained history is limited to 60 days and the compact snapshots lack comparable review, batch and score evidence across sources. A future archive must preserve comparable evidence and a versioned scoring definition without destructively migrating existing history.

## Validation
The pure interpretation functions have deterministic unit tests with fixed dates. The repository's existing CI validates the full Node test suite and Android web assets on a draft PR. The Android release and package signing are outside this phase.
