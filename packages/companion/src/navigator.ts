/**
 * Random artwork navigation logic.
 *
 * Implements:
 * - Fisher-Yates shuffle for randomization
 * - No-repeat deck consumption
 * - History-based back/forward navigation
 * - Automatic deck refill when exhausted
 */

/**
 * Random number generator interface (for testing).
 */
export interface RandomSource {
    random(): number;
}

/**
 * Default random source using Math.random().
 */
export const defaultRandomSource: RandomSource = {
    random: () => Math.random()
};

/**
 * Fisher-Yates shuffle algorithm.
 */
export function shuffle<T>(array: T[], random: RandomSource = defaultRandomSource): T[] {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

/**
 * Artwork navigator state.
 */
export interface NavigatorState<T> {
    /** Available artworks (full catalog) */
    catalog: T[];

    /** Randomized deck (artworks not yet shown) */
    deck: T[];

    /** History of viewed artworks */
    history: T[];

    /** Current position in history (-1 if at the end) */
    cursor: number;

    /** Excluded artwork IDs (e.g., failed to load) */
    excluded: Set<T>;
}

/**
 * Creates a new navigator state.
 */
export function createNavigator<T>(
    catalog: T[],
    random: RandomSource = defaultRandomSource
): NavigatorState<T> {
    if (catalog.length === 0) {
        throw new Error('Catalog cannot be empty');
    }

    const deck = shuffle(catalog, random);

    return {
        catalog,
        deck,
        history: [],
        cursor: -1,
        excluded: new Set(),
    };
}

/**
 * Gets the current artwork.
 * Returns null if no artwork has been selected yet.
 */
export function getCurrentArtwork<T>(state: NavigatorState<T>): T | null {
    if (state.history.length === 0) {
        return null;
    }

    if (state.cursor === -1) {
        return state.history[state.history.length - 1];
    }

    return state.history[state.cursor];
}

/**
 * Moves to the next artwork.
 *
 * Rules:
 * - If cursor is in the middle of history, move forward in history
 * - If cursor is at the end of history, consume the next deck item
 * - If deck is empty, refill it (excluding most recent artwork)
 */
export function next<T>(
    state: NavigatorState<T>,
    random: RandomSource = defaultRandomSource
): void {
    // If we're in the middle of history, just move forward
    if (state.cursor !== -1 && state.cursor < state.history.length - 1) {
        state.cursor++;
        return;
    }

    // We're at the end of history, need a new artwork from the deck
    if (state.deck.length === 0) {
        refillDeck(state, random);
    }

    // Pop from deck and add to history
    const artwork = state.deck.shift();
    if (!artwork) {
        throw new Error('Deck is empty after refill');
    }

    state.history.push(artwork);
    state.cursor = -1; // At the end of history
}

/**
 * Moves to the previous artwork.
 *
 * Rules:
 * - If cursor is at the end (-1), move to second-to-last item
 * - Otherwise, move cursor backward
 * - Cannot go before the start of history
 */
export function previous<T>(state: NavigatorState<T>): void {
    if (state.history.length === 0) {
        return; // Nothing to go back to
    }

    if (state.cursor === -1) {
        // At the end, move to the second-to-last item (since getCurrentArtwork returns the last)
        if (state.history.length > 1) {
            state.cursor = state.history.length - 2;
        } else {
            state.cursor = 0;
        }
    } else if (state.cursor > 0) {
        state.cursor--;
    }
    // If cursor is already at 0, do nothing (can't go further back)
}

/**
 * Refills the deck when exhausted.
 *
 * Rules:
 * - Shuffle the full catalog
 * - Exclude the most recently viewed artwork (to avoid immediate repeat)
 * - Exclude any artworks that failed to load
 */
function refillDeck<T>(
    state: NavigatorState<T>,
    random: RandomSource
): void {
    const mostRecent = state.history.length > 0
        ? state.history[state.history.length - 1]
        : null;

    // Filter out excluded artworks and most recent
    const available = state.catalog.filter(artwork =>
        artwork !== mostRecent && !state.excluded.has(artwork)
    );

    if (available.length === 0) {
        throw new Error('No available artworks after filtering');
    }

    state.deck = shuffle(available, random);
}

/**
 * Excludes an artwork (e.g., because it failed to load).
 * If it's currently shown, moves to the next artwork.
 */
export function excludeArtwork<T>(
    state: NavigatorState<T>,
    artwork: T,
    random: RandomSource = defaultRandomSource
): void {
    state.excluded.add(artwork);

    // If this is the current artwork, move to next
    const current = getCurrentArtwork(state);
    if (current === artwork) {
        next(state, random);
    }
}

/**
 * Gets the initial artwork (first artwork to show).
 */
export function getInitialArtwork<T>(
    state: NavigatorState<T>
): T {
    if (state.history.length === 0) {
        next(state);
    }

    const artwork = getCurrentArtwork(state);
    if (!artwork) {
        throw new Error('Failed to get initial artwork');
    }

    return artwork;
}
