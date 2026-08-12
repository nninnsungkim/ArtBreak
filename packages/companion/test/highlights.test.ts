import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Catalog {
    artworkCount: number;
    artworks: Array<{ objectID: number; title: string; artist: string }>;
    highlightSelection?: { availableCount: number; sourceCount: number };
    highlightObjectIDs?: number[];
}

function loadCatalog(): Catalog {
    const catalogPath = path.resolve(__dirname, '..', '..', 'resources', 'paintings.json');
    return JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Catalog;
}

describe('Met Highlights catalog', () => {
    it('includes an official Met Highlights subset inside the full catalog', () => {
        const catalog = loadCatalog();
        const highlightIds = catalog.highlightObjectIDs || [];
        const catalogIds = new Set(catalog.artworks.map(artwork => artwork.objectID));

        assert.ok(catalog.highlightSelection);
        assert.equal(catalog.highlightSelection!.availableCount, highlightIds.length);
        assert.ok(catalog.highlightSelection!.sourceCount >= highlightIds.length);
        assert.ok(highlightIds.length > 0);
        assert.ok(highlightIds.length < catalog.artworkCount);
        assert.ok(highlightIds.every(objectID => catalogIds.has(objectID)));
    });

    it('includes Van Gogh\'s self-portrait among the official Highlights', () => {
        const catalog = loadCatalog();
        const featured = catalog.artworks.find(artwork => artwork.objectID === 436532);

        assert.ok(featured);
        assert.match(featured!.title, /Self-Portrait with a Straw Hat/i);
        assert.match(featured!.artist, /Vincent van Gogh/i);
        assert.ok(catalog.highlightObjectIDs?.includes(featured!.objectID));
    });
});
