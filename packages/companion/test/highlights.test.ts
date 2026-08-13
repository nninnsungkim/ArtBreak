import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Catalog {
    artworkCount: number;
    artworks: Array<{
        objectID: number;
        title: string;
        artist: string;
        classification?: string;
        objectName?: string;
    }>;
    highlightSelection?: { availableCount: number; sourceCount: number };
    highlightObjectIDs?: number[];
}

function loadCatalog(): Catalog {
    const catalogPath = path.resolve(__dirname, '..', '..', 'resources', 'paintings.json');
    return JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Catalog;
}

function isPainting(artwork: Catalog['artworks'][number]): boolean {
    return artwork.classification === 'Paintings' || artwork.objectName === 'Painting';
}

describe('Met Famous paintings catalog', () => {
    it('contains only paintings, including the official Famous subset', () => {
        const catalog = loadCatalog();
        const highlightIds = catalog.highlightObjectIDs || [];
        const catalogIds = new Set(catalog.artworks.map(artwork => artwork.objectID));

        assert.equal(catalog.artworkCount, catalog.artworks.length);
        assert.ok(catalog.artworks.every(isPainting));
        assert.ok(catalog.highlightSelection);
        assert.equal(catalog.highlightSelection!.availableCount, highlightIds.length);
        assert.ok(catalog.highlightSelection!.sourceCount >= highlightIds.length);
        assert.ok(highlightIds.length > 0);
        assert.ok(highlightIds.length < catalog.artworkCount);
        assert.ok(highlightIds.every(objectID => catalogIds.has(objectID)));
    });

    it('includes Van Gogh\'s self-portrait among the Famous paintings', () => {
        const catalog = loadCatalog();
        const featured = catalog.artworks.find(artwork => artwork.objectID === 436532);

        assert.ok(featured);
        assert.match(featured!.title, /Self-Portrait with a Straw Hat/i);
        assert.match(featured!.artist, /Vincent van Gogh/i);
        assert.ok(isPainting(featured!));
        assert.ok(catalog.highlightObjectIDs?.includes(featured!.objectID));
    });
});
