#!/usr/bin/env ts-node
/**
 * Extract longitude and latitude from a KMZ file.
 * KMZ is a ZIP containing a KML (XML) file; KML <coordinates> use order: longitude,latitude[,altitude].
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/extract-kmz-coordinates.ts <path-to.kmz>
 *   npx ts-node --transpile-only scripts/extract-kmz-coordinates.ts <path-to.kmz> [path2.kmz ...]
 *   npm run extract-kmz-coordinates -- path/to/file.kmz
 *
 * Output: JSON per file { file, longitude, latitude } or { file, error }.
 */

import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

export interface KmzCoordinates {
  file: string;
  longitude: number;
  latitude: number;
  altitude?: number;
}

export interface KmzError {
  file: string;
  error: string;
}

/**
 * Parse KML text for first <coordinates>...</coordinates>.
 * KML order is longitude,latitude,altitude (space or comma separated; can be multiple points).
 * Handles optional XML namespace on the coordinates tag.
 */
export function parseCoordinatesFromKml(kmlText: string): { longitude: number; latitude: number; altitude?: number } | null {
  // Strip BOM and allow optional namespace prefix on tag (e.g. <kml:coordinates>)
  const clean = kmlText.replace(/^\uFEFF/, '').trim();
  const match = clean.match(/<\w*:?coordinates[^>]*>([\s\S]*?)<\/\w*:?coordinates>/i);
  if (!match) return null;
  // Coordinates are "lon,lat,alt lon,lat,alt ..." (space- or newline-separated)
  const raw = match[1].trim().replace(/\s+/g, ' ');
  const first = raw.split(/\s/).filter((s) => s.length > 0)[0];
  if (!first) return null;
  const parts = first.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return {
    longitude: parts[0],
    latitude: parts[1],
    altitude: parts.length >= 3 && !Number.isNaN(parts[2]) ? parts[2] : undefined,
  };
}

/**
 * Extract lon/lat from a KMZ buffer (e.g. from Azure Blob or disk read).
 * Returns first point from first <coordinates> in the root KML, or null.
 */
export function extractCoordinatesFromKmzBuffer(kmzBuffer: Buffer): { longitude: number; latitude: number; altitude?: number } | null {
  try {
    const zip = new AdmZip(kmzBuffer);
    const entries = zip.getEntries();
    const kmlEntry = entries.find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) return null;
    const kmlText = kmlEntry.getData().toString('utf8');
    return parseCoordinatesFromKml(kmlText);
  } catch {
    return null;
  }
}

/**
 * Extract lon/lat from a KMZ file. Returns first point from first <coordinates> in the root KML.
 */
export function extractCoordinatesFromKmz(kmzPath: string): KmzCoordinates | KmzError {
  const baseName = path.basename(kmzPath);
  let result: KmzCoordinates | KmzError;
  try {
    const buf = fs.readFileSync(kmzPath);
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    const kmlEntry = entries.find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) {
      return { file: baseName, error: 'No .kml file found inside KMZ' };
    }
    const kmlText = kmlEntry.getData().toString('utf8');
    const coords = parseCoordinatesFromKml(kmlText);
    if (!coords) {
      result = { file: baseName, error: 'No <coordinates> found in KML' };
    } else {
      result = {
        file: baseName,
        longitude: coords.longitude,
        latitude: coords.latitude,
        ...(coords.altitude != null && { altitude: coords.altitude }),
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result = { file: baseName, error: msg };
  }
  return result;
}

function main() {
  const args = process.argv.slice(2).filter((a) => a && !a.startsWith('--'));
  if (args.length === 0) {
    console.log('Usage: npx ts-node scripts/extract-kmz-coordinates.ts <file.kmz> [file2.kmz ...]');
    console.log('   Or:  npm run extract-kmz-coordinates -- path/to/file.kmz');
    process.exit(1);
  }
  const results: (KmzCoordinates | KmzError)[] = [];
  for (const file of args) {
    const resolved = path.resolve(process.cwd(), file);
    if (!fs.existsSync(resolved)) {
      results.push({ file: path.basename(file), error: 'File not found' });
      continue;
    }
    results.push(extractCoordinatesFromKmz(resolved));
  }
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
}

if (require.main === module) {
  main();
}
