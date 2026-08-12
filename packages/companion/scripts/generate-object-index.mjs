import { createGunzip } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetCount = 10_000;
const metImageHost = 'images.metmuseum.org';
const openAccessCsv = 'https://huggingface.co/datasets/metmuseum/openaccess/resolve/main/openaccess.csv.gz?download=true';

function namedArtist(value) {
    const artist = value?.trim();
    return artist && !/^unknown\b/i.test(artist) ? artist : null;
}

function hasAllowedImage(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === metImageHost;
    } catch {
        return false;
    }
}

function parseCsvRecord(record) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < record.length; index++) {
        const character = record[index];
        if (character === '"') {
            if (quoted && record[index + 1] === '"') {
                value += '"';
                index++;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            values.push(value);
            value = '';
        } else {
            value += character;
        }
    }
    values.push(value.replace(/\r$/, ''));
    return values;
}

function isCompleteCsvRecord(record) {
    let quoted = false;
    for (let index = 0; index < record.length; index++) {
        if (record[index] !== '"') continue;
        if (quoted && record[index + 1] === '"') {
            index++;
        } else {
            quoted = !quoted;
        }
    }
    return !quoted;
}

function compactTags(value) {
    if (!value) return [];
    try {
        const tags = JSON.parse(value);
        if (Array.isArray(tags)) {
            return [...new Set(tags.map(tag => typeof tag === 'string' ? tag : tag?.term).filter(Boolean))].slice(0, 3);
        }
    } catch {
        // Some older exports use a delimited value instead of JSON.
    }
    return [...new Set(value.split(/[|;]/).map(tag => tag.trim()).filter(Boolean))].slice(0, 3);
}

function normalizeObject(row) {
    const artist = namedArtist(row.artistDisplayName);
    if (row.isPublicDomain.toLowerCase() !== 'true' || !row.title?.trim() || !artist || !hasAllowedImage(row.primaryImageSmall)) {
        return null;
    }

    return {
        objectID: Number(row.objectID),
        title: row.title.trim(),
        artist,
        artistBio: row.artistDisplayBio?.trim() || '',
        artistRole: row.artistRole?.trim() || '',
        artistNationality: row.artistNationality?.trim() || '',
        date: row.objectDate?.trim() || 'Undated',
        imageUrl: row.primaryImageSmall,
        zoomImageUrl: hasAllowedImage(row.primaryImage) ? row.primaryImage : row.primaryImageSmall,
        objectName: row.objectName?.trim() || '',
        medium: row.medium?.trim() || '',
        culture: row.culture?.trim() || '',
        period: row.period?.trim() || '',
        dynasty: row.dynasty?.trim() || '',
        reign: row.reign?.trim() || '',
        geographyType: row.geographyType?.trim() || '',
        city: row.city?.trim() || '',
        country: row.country?.trim() || '',
        region: row.region?.trim() || '',
        dimensions: row.dimensions?.trim() || '',
        classification: row.classification?.trim() || '',
        department: row.department?.trim() || '',
        tags: compactTags(row.tags),
        isTimelineWork: row.isTimelineWork.toLowerCase() === 'true',
    };
}

function artTier(artwork) {
    const classification = artwork.classification.toLowerCase();
    const objectName = artwork.objectName.toLowerCase();
    if (classification.includes('painting') || objectName.includes('painting')) return 0;
    if (classification.includes('sculpture') || objectName.includes('sculpture')) return 1;
    if (classification.includes('drawing') || classification.includes('print')) return 2;
    return 3;
}

function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

const spotlightIndex = JSON.parse(await readFile(resolve(packageRoot, 'resources', 'object-ids.json'), 'utf8'));
const spotlightRank = new Map((spotlightIndex.objectIDs || []).map((objectID, rank) => [objectID, rank]));

const response = await fetch(openAccessCsv);
if (!response.ok || !response.body) {
    throw new Error(`Unable to download the Met Open Access CSV: ${response.status}`);
}

const input = Readable.fromWeb(response.body).pipe(createGunzip());
input.setEncoding('utf8');
let headers = null;
let lineRemainder = '';
let recordBuffer = '';
let rowsRead = 0;
const spotlightWorks = [];
const supplementaryWorks = [];

for await (const chunk of input) {
    const lines = (lineRemainder + chunk).split('\n');
    lineRemainder = lines.pop();

    for (const line of lines) {
        recordBuffer = recordBuffer ? `${recordBuffer}\n${line}` : line;
        if (!isCompleteCsvRecord(recordBuffer)) continue;

        const cells = parseCsvRecord(recordBuffer);
        recordBuffer = '';
        if (!headers) {
            headers = cells;
            continue;
        }

        rowsRead++;
        const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
        const artwork = normalizeObject(row);
        if (!artwork) continue;

        const rank = spotlightRank.get(artwork.objectID);
        if (rank !== undefined) {
            spotlightWorks.push({ rank, artwork });
        } else {
            supplementaryWorks.push(artwork);
        }

        if (rowsRead % 50_000 === 0) {
            console.log(`Read ${rowsRead} CSV rows; found ${spotlightWorks.length} spotlight works.`);
        }
    }
}

if (lineRemainder) {
    recordBuffer = recordBuffer ? `${recordBuffer}\n${lineRemainder}` : lineRemainder;
}

if (recordBuffer.trim() && isCompleteCsvRecord(recordBuffer)) {
    const cells = parseCsvRecord(recordBuffer);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
    const artwork = normalizeObject(row);
    if (artwork) {
        const rank = spotlightRank.get(artwork.objectID);
        if (rank !== undefined) spotlightWorks.push({ rank, artwork });
        else supplementaryWorks.push(artwork);
    }
}

spotlightWorks.sort((left, right) => left.rank - right.rank);
supplementaryWorks.sort((left, right) => {
    const timelineDifference = Number(right.isTimelineWork) - Number(left.isTimelineWork);
    if (timelineDifference !== 0) return timelineDifference;
    const artTierDifference = artTier(left) - artTier(right);
    if (artTierDifference !== 0) return artTierDifference;
    return stableHash(left.objectID) - stableHash(right.objectID);
});

const artworks = [
    ...spotlightWorks.map(entry => entry.artwork),
    ...supplementaryWorks,
].slice(0, targetCount).map(({ isTimelineWork, ...artwork }) => artwork);

if (artworks.length !== targetCount) {
    throw new Error(`Only found ${artworks.length} eligible named public-domain works; expected ${targetCount}`);
}

await writeFile(
    resolve(packageRoot, 'resources', 'paintings.json'),
    `${JSON.stringify({
        schemaVersion: 2,
        source: 'The Metropolitan Museum of Art Open Access CSV',
        selection: 'The 10,000-work Met spotlight index first, supplemented by named public-domain Timeline Works and paintings, sculptures, and works on paper.',
        artworkCount: targetCount,
        sourceCounts: {
            spotlightIndex: spotlightWorks.length,
            supplementary: targetCount - spotlightWorks.length,
        },
        artworks,
    })}\n`,
    'utf8'
);

console.log(`Wrote ${artworks.length} eligible Met spotlight artworks from ${rowsRead} CSV rows.`);
