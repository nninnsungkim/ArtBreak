// ArtBreak UI. The bundled catalog contains 10,000 prevalidated Met works.
// The compact footer displays only source catalog fields; no descriptive copy
// is generated and no LLM is used.

// The image remains a single DOM element, so retain a very generous safety
// ceiling rather than allowing an accidental gesture to create an unbounded
// layout. 32x native resolution is far beyond the useful detail available in
// the Met source images while still feeling effectively unrestricted.
const ZOOM_MIN_SCALE = 0.01;
const ZOOM_MAX_SCALE = 32;
const ZOOM_KEY_STEP = 1.15;
const COLLECTION_MODE_FAMOUS = 'famous';
const COLLECTION_MODE_EXPLORE = 'explore';

function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function namedArtist(value) {
    const artist = value?.trim();
    return artist && !/^unknown\b/i.test(artist) ? artist : null;
}

function isPainting(artwork) {
    const classification = artwork?.classification?.trim().toLowerCase();
    const objectName = artwork?.objectName?.trim().toLowerCase();
    return classification === 'paintings' || objectName === 'painting';
}

function artworkFacts(artwork) {
    return [...new Set([
        artwork.objectName,
        artwork.medium,
        artwork.culture,
        artwork.period,
        artwork.classification,
        artwork.department,
        ...(artwork.tags || []),
    ].filter(Boolean))].join(' \u00b7 ');
}

function setOptionalText(element, value) {
    element.textContent = value;
    element.hidden = !value;
}

let catalog = [];
let fullCatalog = [];
let famousObjectIDs = new Set();
let collectionMode = COLLECTION_MODE_FAMOUS;
let deck = [];
let history = [];
let cursor = -1;
let currentImageUrl = null;
let zoomScale = 1;
let zoomFitScale = 1;
let zoomGesture = null;
let panGesture = null;
let lastFocusedElement = null;
let zoomModifierKeyDown = false;
let suppressImageClick = false;
let pendingZoomMultiplier = 1;
let zoomAvailable = false;

function getCurrentArtwork() {
    if (history.length === 0) return null;
    return cursor === -1 ? history[history.length - 1] : history[cursor];
}

function metObjectUrl(artwork) {
    if (!Number.isSafeInteger(artwork?.objectID) || artwork.objectID <= 0) return null;
    return `https://www.metmuseum.org/art/collection/search/${artwork.objectID}`;
}

async function openMetObject() {
    const url = metObjectUrl(getCurrentArtwork());
    const opener = window.__TAURI__?.opener;
    if (!url || !opener?.openUrl) {
        console.error('The Met link is unavailable in this window.');
        return;
    }

    try {
        await opener.openUrl(url);
    } catch (error) {
        console.error('Failed to open the Met artwork page:', error);
    }
}

function next() {
    if (cursor !== -1 && cursor < history.length - 1) {
        cursor++;
        return true;
    }

    if (deck.length === 0) {
        const mostRecent = history.length > 0 ? history[history.length - 1] : null;
        deck = shuffle(catalog.filter(artwork => artwork !== mostRecent));
    }

    const artwork = deck.shift();
    if (!artwork) return false;
    history.push(artwork);
    cursor = -1;
    return true;
}

function previous() {
    if (history.length === 0) return;
    if (cursor === -1) {
        cursor = Math.max(0, history.length - 2);
    } else if (cursor > 0) {
        cursor--;
    }
}

function catalogForCollectionMode(mode) {
    if (mode === COLLECTION_MODE_FAMOUS) {
        const famous = fullCatalog.filter(artwork => famousObjectIDs.has(artwork.objectID));
        if (famous.length > 0) return famous;
    }
    return fullCatalog;
}

function updateCollectionModeControls() {
    const famousButton = document.getElementById('famous-mode-btn');
    const exploreButton = document.getElementById('explore-mode-btn');
    if (!famousButton || !exploreButton) return;

    const showingFamous = collectionMode === COLLECTION_MODE_FAMOUS;
    famousButton.setAttribute('aria-pressed', String(showingFamous));
    exploreButton.setAttribute('aria-pressed', String(!showingFamous));
}

function startNavigator(artworks) {
    catalog = artworks;
    history = [];
    cursor = -1;
    deck = shuffle(catalog);
    next();
}

function setCollectionMode(mode) {
    if (mode !== COLLECTION_MODE_FAMOUS && mode !== COLLECTION_MODE_EXPLORE) return false;

    const nextCatalog = catalogForCollectionMode(mode);
    if (nextCatalog.length === 0) return false;

    collectionMode = mode;
    startNavigator(nextCatalog);
    updateCollectionModeControls();
    return true;
}

function initNavigator(artworks, highlights) {
    fullCatalog = artworks.filter(artwork =>
        namedArtist(artwork.artist) && artwork.title?.trim() && artwork.imageUrl && isPainting(artwork)
    );
    if (fullCatalog.length === 0) throw new Error('Catalog has no displayable artworks');

    const availableObjectIDs = new Set(fullCatalog.map(artwork => artwork.objectID));
    famousObjectIDs = new Set((Array.isArray(highlights) ? highlights : [])
        .filter(objectID => Number.isSafeInteger(objectID) && availableObjectIDs.has(objectID)));

    // Famous is The Met's own selection of popular and important paintings.
    // If a future bundled catalog has no matching IDs, keep the gallery usable
    // by falling back to the complete Explore collection.
    const initialMode = famousObjectIDs.size > 0
        ? COLLECTION_MODE_FAMOUS
        : COLLECTION_MODE_EXPLORE;
    setCollectionMode(initialMode);
}

function preloadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
    });
}

function isZoomOpen() {
    return !document.getElementById('zoom-overlay').hidden;
}

function isZoomModifierActive(event) {
    return Boolean(event.ctrlKey || event.metaKey || zoomModifierKeyDown);
}

function applyZoomScale() {
    const image = document.getElementById('zoom-image');
    if (!image.naturalWidth || !image.naturalHeight) return;
    image.style.width = `${Math.max(1, Math.round(image.naturalWidth * zoomScale))}px`;
    image.style.height = `${Math.max(1, Math.round(image.naturalHeight * zoomScale))}px`;
}

function clampZoomScale(value) {
    return Math.min(ZOOM_MAX_SCALE, Math.max(ZOOM_MIN_SCALE, value));
}

function centerOfZoomViewport() {
    const viewport = document.getElementById('zoom-viewport');
    return {
        x: viewport.clientWidth / 2,
        y: viewport.clientHeight / 2,
    };
}

function viewportPoint(event) {
    const viewport = document.getElementById('zoom-viewport');
    const bounds = viewport.getBoundingClientRect();
    return {
        x: Math.min(viewport.clientWidth, Math.max(0, event.clientX - bounds.left)),
        y: Math.min(viewport.clientHeight, Math.max(0, event.clientY - bounds.top)),
    };
}

function setZoomScale(nextScale, anchor = null) {
    const image = document.getElementById('zoom-image');
    const viewport = document.getElementById('zoom-viewport');
    const next = clampZoomScale(nextScale);
    if (!image.naturalWidth || !image.naturalHeight || next === zoomScale) return;

    // Keep the exact detail beneath the pointer stable while zooming. This
    // makes a wheel, trackpad, or Ctrl-drag gesture feel like an inspection
    // tool instead of moving the artwork away from the user's focus.
    const viewportBounds = viewport.getBoundingClientRect();
    const before = image.getBoundingClientRect();
    const focus = anchor && before.width && before.height ? {
        x: Math.min(1, Math.max(0, (anchor.x - (before.left - viewportBounds.left)) / before.width)),
        y: Math.min(1, Math.max(0, (anchor.y - (before.top - viewportBounds.top)) / before.height)),
    } : null;

    zoomScale = next;
    applyZoomScale();

    if (focus && anchor) {
        const after = image.getBoundingClientRect();
        viewport.scrollLeft += (after.left - viewportBounds.left) + (focus.x * after.width) - anchor.x;
        viewport.scrollTop += (after.top - viewportBounds.top) + (focus.y * after.height) - anchor.y;
    }
}

function centerZoomViewport() {
    const viewport = document.getElementById('zoom-viewport');
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
}

function resetZoom({ preserveScale = false } = {}) {
    const viewport = document.getElementById('zoom-viewport');
    const image = document.getElementById('zoom-image');
    if (!image.naturalWidth || !image.naturalHeight || !viewport.clientWidth || !viewport.clientHeight) return;

    zoomFitScale = Math.min(
        (viewport.clientWidth - 72) / image.naturalWidth,
        (viewport.clientHeight - 72) / image.naturalHeight,
        1,
    );
    zoomFitScale = Math.max(0.05, zoomFitScale);
    zoomScale = preserveScale ? clampZoomScale(zoomScale) : zoomFitScale;
    if (pendingZoomMultiplier !== 1) {
        setZoomScale(zoomScale * pendingZoomMultiplier, centerOfZoomViewport());
        pendingZoomMultiplier = 1;
    }
    applyZoomScale();
    if (!preserveScale) requestAnimationFrame(centerZoomViewport);
}

function openZoom({ focusCloseButton = true } = {}) {
    // WebView startup can replay the pointer event that gave the native window
    // focus. Do not treat that event as an intentional request to enlarge.
    if (!zoomAvailable) return;
    const artwork = getCurrentArtwork();
    if (!artwork) return;
    const overlay = document.getElementById('zoom-overlay');
    const image = document.getElementById('zoom-image');
    if (!overlay.hidden) {
        if (focusCloseButton) document.getElementById('zoom-close-btn').focus();
        return;
    }
    lastFocusedElement = document.activeElement;
    overlay.hidden = false;
    document.getElementById('zoom-title').textContent = artwork.title;
    image.alt = `${artwork.title} \u2014 ${namedArtist(artwork.artist)}`;

    const complete = () => {
        if (getCurrentArtwork() === artwork && isZoomOpen()) resetZoom();
    };
    image.onload = complete;
    image.onerror = () => {
        image.src = artwork.imageUrl;
        image.onerror = null;
    };
    image.src = artwork.zoomImageUrl || artwork.imageUrl;
    if (image.complete) complete();
    if (focusCloseButton) document.getElementById('zoom-close-btn').focus();
}

function closeZoom() {
    const overlay = document.getElementById('zoom-overlay');
    if (overlay.hidden) return;
    zoomGesture = null;
    clearPanGesture();
    overlay.hidden = true;
    document.getElementById('zoom-image').removeAttribute('src');
    lastFocusedElement?.focus?.();
}

function beginModifierDrag(event) {
    if (!isZoomModifierActive(event) || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    suppressImageClick = true;
    if (!isZoomOpen()) openZoom({ focusCloseButton: false });
    zoomGesture = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScale: zoomScale,
        captureTarget: event.currentTarget,
    };
}

function updateModifierDrag(event) {
    if (!zoomGesture || event.pointerId !== zoomGesture.pointerId) return;
    event.preventDefault();
    // Upward movement zooms in; downward movement zooms out. An exponential
    // scale keeps the gesture smooth at both small and large image sizes.
    const movement = zoomGesture.startY - event.clientY;
    const multiplier = Math.exp(movement / 240);
    const image = document.getElementById('zoom-image');
    if (!image.naturalWidth || !image.naturalHeight) {
        // The first Ctrl-drag can begin before the full-resolution image is
        // ready. Keep that intent and apply it from resetZoom() on load.
        pendingZoomMultiplier = multiplier;
        return;
    }
    setZoomScale(zoomGesture.startScale * multiplier, viewportPoint(event));
}

function endModifierDrag(event) {
    if (!zoomGesture || event.pointerId !== zoomGesture.pointerId) return;
    zoomGesture.captureTarget?.releasePointerCapture?.(event.pointerId);
    zoomGesture = null;
}

function clearPanGesture() {
    if (!panGesture) return;
    panGesture.captureTarget?.releasePointerCapture?.(panGesture.pointerId);
    panGesture.captureTarget?.classList.remove('is-panning');
    panGesture = null;
}

function beginPan(event) {
    if (event.button !== 0 || !isZoomOpen()) return;
    event.preventDefault();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    event.currentTarget?.classList.add('is-panning');
    panGesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: event.currentTarget.scrollLeft,
        startScrollTop: event.currentTarget.scrollTop,
        captureTarget: event.currentTarget,
    };
}

function beginViewportPointerInteraction(event) {
    if (isZoomModifierActive(event)) {
        beginModifierDrag(event);
    } else {
        beginPan(event);
    }
}

function updatePan(event) {
    if (!panGesture || event.pointerId !== panGesture.pointerId) return;
    event.preventDefault();
    const viewport = panGesture.captureTarget;
    // Move the viewport opposite to the hand movement, matching the familiar
    // "grab the canvas" behavior in image viewers and maps.
    viewport.scrollLeft = panGesture.startScrollLeft - (event.clientX - panGesture.startX);
    viewport.scrollTop = panGesture.startScrollTop - (event.clientY - panGesture.startY);
}

function endPan(event) {
    if (!panGesture || event.pointerId !== panGesture.pointerId) return;
    clearPanGesture();
}

function updatePointerInteraction(event) {
    updateModifierDrag(event);
    updatePan(event);
}

function endPointerInteraction(event) {
    endModifierDrag(event);
    endPan(event);
}

function nudgeZoom(multiplier) {
    if (!isZoomOpen()) {
        pendingZoomMultiplier *= multiplier;
        openZoom({ focusCloseButton: false });
        return;
    }
    setZoomScale(zoomScale * multiplier, centerOfZoomViewport());
}

function zoomWithWheel(event) {
    if (!isZoomModifierActive(event)) return;
    event.preventDefault();

    const viewport = document.getElementById('zoom-viewport');
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * viewport.clientHeight
            : event.deltaY;
    // Exponential scaling responds smoothly to both mouse wheels and
    // trackpads, without forcing a fixed set of zoom levels.
    // Keep wheel and trackpad updates deliberately fine-grained: one scroll
    // gesture now changes the logarithmic zoom distance by one third of the
    // previous amount, avoiding the abrupt jumps common on mouse wheels.
    const multiplier = Math.exp(-pixels / 1440);

    if (!isZoomOpen()) {
        pendingZoomMultiplier *= multiplier;
        openZoom({ focusCloseButton: false });
        return;
    }
    setZoomScale(zoomScale * multiplier, viewportPoint(event));
}

async function updateArtwork() {
    const artwork = getCurrentArtwork();
    if (!artwork) return;
    if (isZoomOpen()) closeZoom();

    const artworkTitle = document.getElementById('artwork-title');
    const artworkArtist = document.getElementById('artwork-artist');
    const artworkFactsElement = document.getElementById('artwork-facts');
    const artworkImage = document.getElementById('artwork-image');
    const artist = namedArtist(artwork.artist);

    artworkTitle.textContent = artwork.title;
    artworkArtist.textContent = `${artist} \u2022 ${artwork.date || 'Undated'}`;
    setOptionalText(artworkFactsElement, artworkFacts(artwork));

    if (artwork.imageUrl === currentImageUrl) return;
    try {
        artworkImage.style.opacity = '0.45';
        const image = await preloadImage(artwork.imageUrl);
        if (getCurrentArtwork() !== artwork) return;
        artworkImage.src = image.src;
        artworkImage.alt = `${artwork.title} \u2014 ${artist}. Select to enlarge.`;
        currentImageUrl = artwork.imageUrl;
    } catch (error) {
        console.warn('Failed to load artwork image:', error);
        artworkImage.alt = 'Artwork image could not be loaded';
    } finally {
        if (getCurrentArtwork() === artwork) artworkImage.style.opacity = '1';
    }
}

async function loadCatalog() {
    const response = await fetch('./paintings-v3.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
    const data = await response.json();
    return {
        artworks: data.artworks || [],
        highlightObjectIDs: data.highlightObjectIDs || [],
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    const prevButton = document.getElementById('prev-btn');
    const nextButton = document.getElementById('next-btn');
    const famousModeButton = document.getElementById('famous-mode-btn');
    const exploreModeButton = document.getElementById('explore-mode-btn');
    const artworkImage = document.getElementById('artwork-image');
    const zoomViewport = document.getElementById('zoom-viewport');

    try {
        const catalogData = await loadCatalog();
        initNavigator(catalogData.artworks, catalogData.highlightObjectIDs);
        await updateArtwork();
    } catch (error) {
        console.error('Unable to initialize ArtBreak:', error);
        document.getElementById('artwork-title').textContent = 'Artwork catalog unavailable';
        return;
    }

    const advance = async () => {
        nextButton.disabled = true;
        try {
            if (next()) await updateArtwork();
        } finally {
            nextButton.disabled = false;
        }
    };

    prevButton.addEventListener('click', async () => {
        previous();
        await updateArtwork();
    });
    nextButton.addEventListener('click', advance);
    famousModeButton.addEventListener('click', async () => {
        if (setCollectionMode(COLLECTION_MODE_FAMOUS)) await updateArtwork();
    });
    exploreModeButton.addEventListener('click', async () => {
        if (setCollectionMode(COLLECTION_MODE_EXPLORE)) await updateArtwork();
    });
    artworkImage.addEventListener('click', event => {
        if (suppressImageClick) {
            suppressImageClick = false;
            event.preventDefault();
            return;
        }
        openZoom();
    });
    artworkImage.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openZoom();
        }
    });
    artworkImage.addEventListener('pointerdown', beginModifierDrag);
    zoomViewport.addEventListener('pointerdown', beginViewportPointerInteraction);
    artworkImage.addEventListener('wheel', zoomWithWheel, { passive: false });
    zoomViewport.addEventListener('wheel', zoomWithWheel, { passive: false });
    window.addEventListener('pointermove', updatePointerInteraction, { passive: false, capture: true });
    window.addEventListener('pointerup', endPointerInteraction, true);
    window.addEventListener('pointercancel', endPointerInteraction, true);
    document.getElementById('zoom-toggle').addEventListener('click', () => openZoom());
    document.getElementById('met-link-btn').addEventListener('click', openMetObject);
    document.getElementById('zoom-close-btn').addEventListener('click', closeZoom);
    window.addEventListener('resize', () => {
        if (isZoomOpen()) resetZoom({ preserveScale: true });
    });

    window.addEventListener('keydown', event => {
        if (event.key === 'Control' || event.key === 'Meta') zoomModifierKeyDown = true;
    });
    window.addEventListener('keyup', event => {
        if (event.key === 'Control' || event.key === 'Meta') zoomModifierKeyDown = false;
    });
    window.addEventListener('blur', () => {
        zoomModifierKeyDown = false;
        zoomGesture = null;
        clearPanGesture();
    });

    document.addEventListener('keydown', async event => {
        if (isZoomModifierActive(event) && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')) {
            event.preventDefault();
            nudgeZoom(ZOOM_KEY_STEP);
            return;
        }
        if (isZoomModifierActive(event) && (event.key === '-' || event.code === 'NumpadSubtract')) {
            event.preventDefault();
            nudgeZoom(1 / ZOOM_KEY_STEP);
            return;
        }
        if (isZoomModifierActive(event) && event.key === '0' && isZoomOpen()) {
            event.preventDefault();
            resetZoom();
            return;
        }
        if (isZoomOpen()) {
            if (event.key === 'Escape') closeZoom();
            return;
        }

        if (event.key === 'ArrowLeft') {
            previous();
            await updateArtwork();
        } else if (event.key === 'ArrowRight') {
            await advance();
        } else if (event.key === 'Escape') {
            window.close();
        }
    });

    // Enable enlargement after startup input has settled. This still leaves
    // normal mouse, keyboard, and Ctrl-drag actions available immediately to
    // a person using the rendered artwork.
    window.setTimeout(() => {
        zoomAvailable = true;
    }, 250);
});
