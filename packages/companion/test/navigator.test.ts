import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    RandomSource,
    shuffle,
    createNavigator,
    getCurrentArtwork,
    next,
    previous,
    excludeArtwork,
    getInitialArtwork
} from '../src/navigator';

/**
 * Deterministic random source for testing.
 */
class FakeRandom implements RandomSource {
    private index = 0;
    private values: number[];

    constructor(values: number[]) {
        this.values = values;
    }

    random(): number {
        const value = this.values[this.index % this.values.length];
        this.index++;
        return value;
    }
}

describe('navigator', () => {
    describe('shuffle', () => {
        it('should shuffle array with deterministic random', () => {
            const input = [1, 2, 3, 4, 5];
            const random = new FakeRandom([0.9, 0.5, 0.1, 0.0]);
            const result = shuffle(input, random);

            // With these specific random values, should produce a specific shuffle
            assert.notDeepEqual(result, input);
            assert.equal(result.length, input.length);
        });

        it('should not modify original array', () => {
            const input = [1, 2, 3];
            const random = new FakeRandom([0.5, 0.5]);
            shuffle(input, random);

            assert.deepEqual(input, [1, 2, 3]);
        });
    });

    describe('createNavigator', () => {
        it('should create navigator with shuffled deck', () => {
            const catalog = [1, 2, 3, 4, 5];
            const random = new FakeRandom([0.5, 0.5, 0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            assert.equal(nav.catalog.length, 5);
            assert.equal(nav.deck.length, 5);
            assert.equal(nav.history.length, 0);
            assert.equal(nav.cursor, -1);
        });

        it('should throw for empty catalog', () => {
            assert.throws(() => {
                createNavigator([]);
            });
        });
    });

    describe('navigation', () => {
        it('should show first artwork with getInitialArtwork', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            const first = getInitialArtwork(nav);

            assert.ok(first !== null);
            assert.equal(nav.history.length, 1);
        });

        it('should advance through deck with next', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.5, 0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            getInitialArtwork(nav);
            const first = getCurrentArtwork(nav);

            next(nav, random);
            const second = getCurrentArtwork(nav);

            next(nav, random);
            const third = getCurrentArtwork(nav);

            assert.notEqual(first, second);
            assert.notEqual(second, third);
            assert.equal(nav.history.length, 3);
        });

        it('should go back in history with previous', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.5, 0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            getInitialArtwork(nav);
            next(nav, random);
            next(nav, random);

            const third = getCurrentArtwork(nav);

            previous(nav);
            const second = getCurrentArtwork(nav);

            previous(nav);
            const first = getCurrentArtwork(nav);

            assert.notEqual(third, second);
            assert.notEqual(second, first);
            assert.equal(nav.history.length, 3);
        });

        it('should move forward in history after going back', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.5, 0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            getInitialArtwork(nav);
            next(nav, random);
            const second = getCurrentArtwork(nav);

            previous(nav);
            next(nav, random);
            const secondAgain = getCurrentArtwork(nav);

            assert.equal(second, secondAgain);
        });

        it('should not repeat until deck exhausted', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.1, 0.2, 0.3, 0.4, 0.5]);
            const nav = createNavigator(catalog, random);

            const seen = new Set();

            getInitialArtwork(nav);
            seen.add(getCurrentArtwork(nav));

            next(nav, random);
            seen.add(getCurrentArtwork(nav));

            next(nav, random);
            seen.add(getCurrentArtwork(nav));

            // After 3 items, should have seen all 3 unique items
            assert.equal(seen.size, 3);
        });

        it('should refill deck when exhausted', () => {
            const catalog = ['A', 'B'];
            const random = new FakeRandom([0.5, 0.5, 0.5, 0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            getInitialArtwork(nav);
            next(nav, random);
            // Deck should now be empty

            next(nav, random);
            // Should have refilled and continued

            assert.equal(nav.history.length, 3);
        });

        it('should not immediately repeat after deck refill', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
            const nav = createNavigator(catalog, random);

            // Consume entire deck
            getInitialArtwork(nav);
            next(nav, random);
            next(nav, random);

            const lastBeforeRefill = getCurrentArtwork(nav);

            // This should trigger refill
            next(nav, random);
            const firstAfterRefill = getCurrentArtwork(nav);

            // Should not be the same as the last one before refill
            assert.notEqual(lastBeforeRefill, firstAfterRefill);
        });
    });

    describe('excludeArtwork', () => {
        it('should exclude artwork from future shuffles', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.5, 0.5, 0.5, 0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            getInitialArtwork(nav);
            const first = getCurrentArtwork(nav);

            excludeArtwork(nav, first!, random);

            // Advance through remaining items
            const seen = new Set();
            for (let i = 0; i < 10; i++) {
                const current = getCurrentArtwork(nav);
                if (current) {
                    seen.add(current);
                }
                next(nav, random);
            }

            // Should not see the excluded artwork
            assert.ok(!seen.has(first));
        });

        it('should move to next when excluding current artwork', () => {
            const catalog = ['A', 'B', 'C'];
            const random = new FakeRandom([0.5, 0.5, 0.5]);
            const nav = createNavigator(catalog, random);

            getInitialArtwork(nav);
            const first = getCurrentArtwork(nav);

            excludeArtwork(nav, first!, random);

            const afterExclude = getCurrentArtwork(nav);

            assert.notEqual(first, afterExclude);
        });
    });
});
