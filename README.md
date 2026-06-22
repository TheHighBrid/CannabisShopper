# CannabisShopper

CannabisShopper is a research-focused cannabis flower comparison tool for legal adult-use cannabis research in Canada. It collects public listing signals from Bulk Buddy's craft cannabis flower category and ranks products for further consideration without directing purchase or making medical/safety claims.

## What it compares

The TypeScript app extracts and normalizes product listing fields when available:

- product name
- price
- package size
- calculated price per gram
- THC percentage
- CBD percentage
- terpene/flavour description
- review count
- review quality/rating
- availability
- discount details
- missing/unreliable field markers

## Scoring rubric

Scores are out of 100 using this weighted rubric:

- THC/CBD risk balance: 25%
- Price/value: 20%
- Product transparency: 15%
- Review quality and volume: 15%
- Flavour/terpene preference match: 15%
- Previous user satisfaction/order history match: 10%

Incomplete listings are intentionally capped in the affected scoring areas so products are not over-scored when THC/CBD, review, price, or package-size data is missing.

## Usage

```bash
npm run build
node dist/index.js
```

If the live website is unavailable from your environment, save the page HTML and run the parser offline:

```bash
node dist/index.js --html-file ./bulkbuddy-craft-flowers.html
```

## Output

The CLI prints a Markdown report with:

- batch date
- source URL
- clean product comparison table
- up to three best overall products for further consideration
- concise reasons and watch-outs for each shortlisted product
- better-value discount notes when discount text is detected
- order-history update template

The tone is intentionally casual, concise, and analytical — “worth-a-look” style — while staying within legal adult-use Canada research context.
