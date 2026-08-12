import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(packageRoot, 'resources', 'paintings.json');
const highlightsUrl = 'https://collectionapi.metmuseum.org/public/collection/v1/search?isHighlight=true&q=*';

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (!Array.isArray(catalog.artworks) || catalog.artworks.length === 0) {
    throw new Error('ArtWait catalog has no artworks to annotate.');
}

const response = await fetch(highlightsUrl);
if (!response.ok) {
    throw new Error(`Unable to fetch Met Highlights: ${response.status}`);
}

const result = await response.json();
if (!Array.isArray(result.objectIDs) || result.objectIDs.length === 0) {
    throw new Error('Met Highlights response did not include object IDs.');
}

const catalogIds = new Set(catalog.artworks.map(artwork => artwork.objectID));
const highlightObjectIDs = [...new Set(result.objectIDs)]
    .filter(objectID => Number.isSafeInteger(objectID) && catalogIds.has(objectID));

if (highlightObjectIDs.length === 0) {
    throw new Error('No Met Highlights are available in the ArtWait catalog.');
}

catalog.highlightSelection = {
    source: 'The Metropolitan Museum of Art Collection API',
    endpoint: highlightsUrl,
    description: 'The Met designates these works as popular and important collection highlights.',
    sourceCount: result.total ?? result.objectIDs.length,
    availableCount: highlightObjectIDs.length,
};
catalog.highlightObjectIDs = highlightObjectIDs;
catalog.selection = 'A 10,000-work Met catalog with a default subset of official Met Highlights, plus a full Explore mode.';
catalog.sourceCounts = {
    ...(catalog.sourceCounts || {}),
    metHighlights: highlightObjectIDs.length,
};

await writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, 'utf8');
console.log(`Tagged ${highlightObjectIDs.length} Met Highlights from ${result.total ?? result.objectIDs.length} source works.`);
