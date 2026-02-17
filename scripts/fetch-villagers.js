/**
 * Fetches ALL Animal Crossing villager poster images from the Fandom wiki
 * via the MediaWiki API (bypasses lazy loading). Saves them locally and
 * skips files that already exist.
 *
 * Source: https://animalcrossing.fandom.com/wiki/Villager_list_(New_Horizons)
 */

import { createWriteStream, mkdirSync, existsSync, writeFileSync } from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'images', 'villagers');
const VILLAGERS_JSON = join(__dirname, '..', 'src', 'data', 'villagers.json');

const API_URL = 'https://animalcrossing.fandom.com/api.php';
const PAGE_TITLE = 'Villager_list_(New_Horizons)';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchAllVillagerImages() {
  const byName = new Map(); // name -> { name, url, isSq }
  let continueToken = undefined;

  do {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'images',
      gimlimit: '500',
      titles: PAGE_TITLE,
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
      ...(continueToken && { [continueToken.key]: continueToken.value }),
    });
    const url = `${API_URL}?${params}`;
    const data = await fetchJson(url);

    for (const page of Object.values(data.query?.pages || {})) {
      const title = page.title || '';
      const match = title.match(/^File:NH-(.+) poster( ?sq)?\.png$/i);
      if (!match) continue;
      const name = match[1].trim();
      const isSq = !!match[2];
      const imgUrl = page.imageinfo?.[0]?.url;
      if (!imgUrl) continue;
      const existing = byName.get(name);
      if (!existing || (existing.isSq && !isSq)) {
        byName.set(name, { name, url: imgUrl, isSq });
      }
    }

    continueToken = data.continue;
  } while (continueToken);

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'image/*', 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        return downloadImage(redirectUrl, filepath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const fileStream = createWriteStream(filepath);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(VILLAGERS_JSON), { recursive: true });

  console.log('Fetching villager list from Fandom API...');
  const images = await fetchAllVillagerImages();
  console.log(`Found ${images.length} villager posters.\n`);

  const villagers = [];
  let downloaded = 0;
  let skipped = 0;

  for (const { name, url } of images) {
    const filename = `NH-${name.replace(/\s+/g, '_')}_poster.png`;
    const filepath = join(OUT_DIR, filename);
    villagers.push({ name, filename });

    if (existsSync(filepath)) {
      skipped++;
      process.stdout.write(`  - ${name} (skipped, exists)\r`);
      continue;
    }

    try {
      await downloadImage(url, filepath);
      downloaded++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  writeFileSync(VILLAGERS_JSON, JSON.stringify(villagers, null, 2), 'utf-8');
  console.log(`\nDone! Downloaded ${downloaded}, skipped ${skipped}.`);
  console.log(`Villager list written to ${VILLAGERS_JSON}`);
}

main().catch(console.error);
