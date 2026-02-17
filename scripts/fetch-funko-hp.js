/**
 * Fetches Harry Potter Funko Pop! images from the Funko Fandom wiki
 * via the MediaWiki API. Saves them locally and skips files that already exist.
 *
 * Source: https://funko.fandom.com/wiki/Pop!_Harry_Potter
 */

import { createWriteStream, mkdirSync, existsSync, writeFileSync } from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'images', 'funko-hp');
const FUNKO_JSON = join(__dirname, '..', 'src', 'data', 'funko-hp.json');

const API_URL = 'https://funko.fandom.com/api.php';
const PAGE_TITLE = 'Pop!_Harry_Potter';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; lrclarkin-fetch/1.0)' } }, (res) => {
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

async function fetchAllFunkoImages() {
  const images = [];
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
      if (!title.startsWith('File:')) continue;
      const imgUrl = page.imageinfo?.[0]?.url;
      if (!imgUrl) continue;
      const ext = (title.match(/\.(png|jpg|jpeg|webp)$/i) || [])[1];
      if (!ext) continue;
      const filename = title.replace(/^File:/, '').trim();
      if (filename.includes('Pack') || filename.includes('poster') || filename.includes('Poster')) continue;
      if (filename.includes('Deluxe') || filename.includes('Moment')) continue;
      const name = filename.replace(/\.[^.]+$/, '').replace(/%5F/g, '_').replace(/_/g, ' ');
      images.push({ name, filename, url: imgUrl });
    }

    continueToken = data.continue;
  } while (continueToken);

  return images;
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

function safeFilename(f) {
  return f.replace(/[<>:"/\\|?*]/g, '_').replace(/%5F/g, '_');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(FUNKO_JSON), { recursive: true });

  console.log('Fetching Harry Potter Funko list from Fandom API...');
  let images;
  try {
    images = await fetchAllFunkoImages();
  } catch (err) {
    console.error('API failed:', err.message);
    console.log('Using fallback list from page content...');
    images = getFallbackImages();
  }

  const seen = new Set();
  const funko = [];
  let downloaded = 0;
  let skipped = 0;

  for (const { name, filename, url } of images) {
    const safe = safeFilename(filename);
    if (seen.has(safe)) continue;
    seen.add(safe);
    const filepath = join(OUT_DIR, safe);
    funko.push({ name, filename: safe });

    if (existsSync(filepath)) {
      skipped++;
      process.stdout.write(`  - ${name} (skipped)\r`);
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

  writeFileSync(FUNKO_JSON, JSON.stringify(funko, null, 2), 'utf-8');
  console.log(`\nDone! Downloaded ${downloaded}, skipped ${skipped}.`);
  console.log(`Funko list written to ${FUNKO_JSON}`);
}

function getFallbackImages() {
  const base = 'https://static.wikia.nocookie.net/funko/images';
  const items = [
    ['Harry Potter', `${base}/9/9c/HarryPotter.png/revision/latest`, 'HarryPotter.png'],
    ['Ron Weasley', `${base}/1/14/RonWeasley.png/revision/latest`, 'RonWeasley.png'],
    ['Hermione Granger', `${base}/a/a4/HermioneGranger.png/revision/latest`, 'HermioneGranger.png'],
    ['Albus Dumbledore', `${base}/d/da/Albus_Dumbledore.png/revision/latest`, 'Albus_Dumbledore.png'],
    ['Severus Snape', `${base}/6/65/Severus_Snape.png/revision/latest`, 'Severus_Snape.png'],
    ['Lord Voldemort', `${base}/0/01/Lord_Voldemort.png/revision/latest`, 'Lord_Voldemort.png'],
    ['Rubeus Hagrid', `${base}/f/fe/Rubeus_Hagrid.png/revision/latest`, 'Rubeus_Hagrid.png'],
    ['Draco Malfoy', `${base}/4/41/51KbEmPfiVL._SX355_.jpg/revision/latest`, 'Draco_Malfoy.jpg'],
    ['Luna Lovegood', `${base}/2/2e/S-l300.jpg/revision/latest`, 'Luna_Lovegood.jpg'],
    ['Dobby', `${base}/a/ae/Funko-Pop-Harry-Potter-17-Dobby.jpg/revision/latest`, 'Dobby.jpg'],
    ['Sirius Black', `${base}/c/cd/Figurine-funko-pop-harry-potter-sirius-black.jpg/revision/latest`, 'Sirius_Black.jpg'],
    ['Neville Longbottom', `${base}/1/14/Funko-Pop-Harry-Potter-22-Neville-Longbottom-Barnes-Noble-Pre-Release.jpg/revision/latest`, 'Neville_Longbottom.jpg'],
    ['Bellatrix Lestrange', `${base}/1/11/Funko-Pop-Harry-Potter-35-Bellatrix-Lestrange.jpg/revision/latest`, 'Bellatrix_Lestrange.jpg'],
    ['Minerva McGonagall', `${base}/c/ce/Funko-Pop-Harry-Potter-37-Minerva-McGonagall.jpg/revision/latest`, 'Minerva_McGonagall.jpg'],
    ['Fred Weasley', `${base}/8/8a/Funko-Pop-Harry-Potter-33-Fred-Weasley.jpg/revision/latest`, 'Fred_Weasley.jpg'],
    ['George Weasley', `${base}/2/26/Funko-Pop-Harry-Potter-34-George-Weasley.jpg/revision/latest`, 'George_Weasley.jpg'],
    ['Remus Lupin', `${base}/7/72/Funko-Pop-Harry-Potter-45-Remus-Lupin.jpg/revision/latest`, 'Remus_Lupin.jpg'],
    ['Ginny Weasley', `${base}/4/48/Funko-Pop-Harry-Potter-46-Ginny-Weasley.jpg/revision/latest`, 'Ginny_Weasley.jpg'],
    ['Hedwig', `${base}/a/a1/76-_Hedwig.jpg/revision/latest`, 'Hedwig.jpg'],
    ['Buckbeak', `${base}/c/c1/104-_Buckbeat.jpg/revision/latest`, 'Buckbeak.jpg'],
  ];
  return items.map(([name, url, filename]) => ({ name, filename, url }));
}

main().catch(console.error);
