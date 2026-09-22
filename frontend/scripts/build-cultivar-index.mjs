#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const beDataset = resolve(projectRoot, '../backend/dataset');
const feVarieties = resolve(projectRoot, 'public/datasets/varietà');
const cropJsonPath = resolve(beDataset, 'crop_family/crop.json');
const familiesPath = resolve(beDataset, 'crop_family/crop-families.csv');
const eupvpPath = resolve(feVarieties, 'EUPVP_Official_List Italy.csv');
const harvestPath = resolve(feVarieties, 'date_raccolta.csv');
const outputPath = resolve(projectRoot, 'public/datasets/cultivars-by-crop.json');

const ITALIAN_MONTHS = {
  gen: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mag: 5,
  giu: 6,
  lug: 7,
  ago: 8,
  set: 9,
  ott: 10,
  nov: 11,
  dic: 12,
};

function log(message) {
  process.stdout.write(`[build-cultivar-index] ${message}\n`);
}

function normalizeKey(value) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function parseSemicolonCsv(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(';').map((cell) => cell.trim().replace(/^\uFEFF/, '')));
}

function parseQuotedCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  });
}

function loadLatinToSpecieKey() {
  const text = readFileSync(familiesPath, 'utf8');
  const rows = parseQuotedCsv(text).slice(1);
  const map = new Map();
  for (const row of rows) {
    const commonName = row[1];
    const latinSpecies = row[6];
    if (!commonName || !latinSpecies) continue;
    const specieKey = normalizeKey(commonName).replace(/\s+/g, '').toUpperCase();
    map.set(normalizeKey(latinSpecies), specieKey);
  }
  return map;
}

function loadHarvestBySpecieVariety() {
  const text = readFileSync(harvestPath, 'utf8');
  const rows = parseSemicolonCsv(text).slice(1);
  const byKey = new Map();
  const bySpecie = new Map();
  for (const row of rows) {
    const [specie, cultivar, offsetRaw, harvestLabel] = row;
    if (!specie || !cultivar || specie === 'SPECIE') continue;
    const specieKey = specie.toUpperCase();
    const varietyKey = normalizeKey(cultivar);
    const key = `${specieKey}|${varietyKey}`;
    const offsetDays = Number.parseInt(offsetRaw, 10);
    const entry = {
      name: cultivar.trim(),
      harvestLabel: harvestLabel ?? undefined,
      offsetDays: Number.isFinite(offsetDays) ? offsetDays : 0,
    };
    byKey.set(key, entry);
    const list = bySpecie.get(specieKey) ?? [];
    list.push(entry);
    bySpecie.set(specieKey, list);
  }
  return { byKey, bySpecie };
}

function isUsefulEupvpRow(varietyStatus, euStatus) {
  if (euStatus !== 'Yes') return false;
  return varietyStatus === 'Registered' || varietyStatus === 'Surrendered';
}

function loadEupvpByCropCode() {
  const text = readFileSync(eupvpPath, 'utf8');
  const rows = parseSemicolonCsv(text).slice(1);
  const byCode = new Map();
  for (const row of rows) {
    const name = row[1];
    const cropCode = row[3];
    const varietyStatus = row[4];
    const euStatus = row[5];
    if (!name || !cropCode || !isUsefulEupvpRow(varietyStatus, euStatus)) continue;
    const list = byCode.get(cropCode) ?? [];
    list.push(name.trim());
    byCode.set(cropCode, list);
  }
  return byCode;
}

function appendVariety(varieties, seen, cropCode, name, harvest) {
  const varietyKey = normalizeKey(name);
  if (seen.has(varietyKey)) {
    if (!harvest?.harvestLabel) return;
    const existing = varieties.find((entry) => normalizeKey(entry.name) === varietyKey);
    if (existing && !existing.harvestLabel && harvest.harvestLabel) {
      existing.harvestLabel = harvest.harvestLabel;
      existing.offsetDays = harvest.offsetDays;
    }
    return;
  }
  seen.add(varietyKey);
  varieties.push({
    id: `${cropCode}|${varietyKey}`,
    name,
    ...(harvest?.harvestLabel ? { harvestLabel: harvest.harvestLabel } : {}),
    ...(harvest?.offsetDays != null ? { offsetDays: harvest.offsetDays } : {}),
  });
}

function buildIndex() {
  const crops = JSON.parse(readFileSync(cropJsonPath, 'utf8'));
  const latinToSpecie = loadLatinToSpecieKey();
  const { byKey: harvestMap, bySpecie: harvestBySpecie } = loadHarvestBySpecieVariety();
  const eupvpByCode = loadEupvpByCropCode();
  const index = {};

  for (const crop of crops) {
    const cropCode = crop.code;
    const specieKey = latinToSpecie.get(normalizeKey(crop.species));
    const rawNames = eupvpByCode.get(cropCode) ?? [];
    const seen = new Set();
    const varieties = [];

    for (const name of rawNames) {
      const varietyKey = normalizeKey(name);
      const harvestKey = specieKey ? `${specieKey}|${varietyKey}` : null;
      const harvest = harvestKey ? harvestMap.get(harvestKey) : undefined;
      appendVariety(varieties, seen, cropCode, name, harvest);
    }

    if (specieKey) {
      for (const harvestEntry of harvestBySpecie.get(specieKey) ?? []) {
        const harvestKey = `${specieKey}|${normalizeKey(harvestEntry.name)}`;
        appendVariety(varieties, seen, cropCode, harvestEntry.name, harvestMap.get(harvestKey));
      }
    }

    varieties.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    if (varieties.length > 0) {
      index[cropCode] = { varieties };
    }
  }

  return index;
}

const index = buildIndex();
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(index));
const cropCount = Object.keys(index).length;
const varietyCount = Object.values(index).reduce((sum, entry) => sum + entry.varieties.length, 0);
log(`wrote ${outputPath} (${cropCount} crops, ${varietyCount} varieties)`);
