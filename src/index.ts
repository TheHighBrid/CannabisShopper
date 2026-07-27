import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { formatRecommendation, buildRecommendationResult } from './output.js';
import { scoreProducts } from './scoring.js';
import { parseProducts, scrapeProducts } from './scraper.js';
import { OrderHistoryEntry, UserPreferences } from './types.js';

const SOURCE_URL = 'https://www.bulkbuddy.co/?term=craft-cannabis-flowers&s=&post_type=product&taxonomy=product_cat';

const defaultPreferences: UserPreferences = {
  targetThcPercent: 27,
  maxThcPercent: 32,
  preferredFlavours: ['citrus', 'gas', 'pine', 'berry', 'diesel'],
  priceSensitivity: 'medium',
  transparencyPriority: 'high'
};

const defaultHistory: OrderHistoryEntry[] = [];

export async function runComparison(htmlFile?: string): Promise<string> {
  const products = htmlFile
    ? parseProducts(await readFile(htmlFile, 'utf8'), SOURCE_URL)
    : await scrapeProducts(SOURCE_URL);

  const scores = scoreProducts(products, defaultPreferences, defaultHistory);
  return formatRecommendation(buildRecommendationResult(SOURCE_URL, products, scores));
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entryUrl) {
  runComparison(readArg('--html-file'))
    .then((output) => console.log(output))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
