#!/usr/bin/env node
/**
 * The Met catalog generation script.
 *
 * This script generates a runtime catalog of public-domain paintings
 * from The Metropolitan Museum of Art Open Access collection.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
    Artwork,
    RuntimeCatalog,
    AuditLog,
    AuditEntry,
    MetObjectResponse
} from './types';

const MET_COLLECTION_API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const ALLOWED_IMAGE_HOST = 'images.metmuseum.org';

/**
 * Configuration for catalog generation.
 */
interface GeneratorConfig {
    /** Maximum artworks to include */
    maxArtworks: number;

    /** Sample object IDs to test with (for MVP) */
    sampleObjectIds?: number[];

    /** Output directory */
    outputDir: string;
}

/**
 * Fetches object details from The Met API.
 */
async function fetchObject(objectId: number): Promise<MetObjectResponse | null> {
    try {
        const url = `${MET_COLLECTION_API}/objects/${objectId}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`Failed to fetch object ${objectId}: ${response.status}`);
            return null;
        }

        return await response.json() as MetObjectResponse;
    } catch (error) {
        console.warn(`Error fetching object ${objectId}:`, error);
        return null;
    }
}

/**
 * Validates that an object meets our criteria.
 */
function validateObject(obj: MetObjectResponse): {
    valid: boolean;
    reason?: string;
} {
    // Must be public domain
    if (!obj.isPublicDomain) {
        return { valid: false, reason: 'Not public domain' };
    }

    // Must have a primary image
    if (!obj.primaryImage) {
        return { valid: false, reason: 'No primary image' };
    }

    // Image must be from allowed host
    try {
        const url = new URL(obj.primaryImage);
        if (!url.hostname.includes(ALLOWED_IMAGE_HOST)) {
            return { valid: false, reason: 'Image not from allowed host' };
        }
    } catch {
        return { valid: false, reason: 'Invalid image URL' };
    }

    // Must be a painting (prefer, but not strict for MVP)
    const isPainting = obj.classification?.toLowerCase().includes('painting') ||
        obj.objectName?.toLowerCase().includes('painting');

    if (!isPainting) {
        // For MVP, we'll be lenient
        console.log(`Object ${obj.objectID} is not explicitly a painting, but including it`);
    }

    return { valid: true };
}

/**
 * Converts a Met object to our artwork format.
 */
function convertToArtwork(obj: MetObjectResponse): Artwork {
    return {
        objectID: obj.objectID,
        title: obj.title || 'Untitled',
        artist: obj.artistDisplayName || 'Unknown Artist',
        date: obj.objectDate || '',
        culture: obj.culture || '',
        imageUrl: obj.primaryImage,
        department: obj.department || '',
        medium: obj.medium || '',
        creditLine: obj.creditLine || '',
    };
}

/**
 * Creates an audit entry.
 */
function createAuditEntry(
    obj: MetObjectResponse,
    accepted: boolean,
    reason?: string
): AuditEntry {
    return {
        objectID: obj.objectID,
        title: obj.title || 'Untitled',
        artist: obj.artistDisplayName || 'Unknown',
        apiUrl: `${MET_COLLECTION_API}/objects/${obj.objectID}`,
        imageUrl: obj.primaryImage || '',
        isPublicDomain: obj.isPublicDomain,
        classification: obj.classification || '',
        fetchedAt: new Date().toISOString(),
    };
}

/**
 * Generates the catalog.
 */
async function generateCatalog(config: GeneratorConfig): Promise<void> {
    console.log('Starting Met catalog generation...');
    console.log(`Max artworks: ${config.maxArtworks}`);

    const artworks: Artwork[] = [];
    const auditEntries: AuditEntry[] = [];
    let processed = 0;
    let accepted = 0;
    let rejected = 0;

    // For MVP, use sample object IDs
    // TODO: In production, parse The Met Open Access CSV
    const objectIds = config.sampleObjectIds || [
        // Well-known public domain paintings
        436535, // Wheat Field with Cypresses by Van Gogh
        438817, // Madame X by John Singer Sargent
        436532, // Self-Portrait with a Straw Hat by Van Gogh
        437133, // Bridge over a Pond of Water Lilies by Monet
        437112, // The Gulf Stream by Winslow Homer
        435809, // Washington Crossing the Delaware by Emanuel Leutze
        436105, // View of Toledo by El Greco
    ];

    console.log(`Processing ${objectIds.length} objects...`);

    for (const objectId of objectIds) {
        if (artworks.length >= config.maxArtworks) {
            console.log(`Reached maximum of ${config.maxArtworks} artworks`);
            break;
        }

        processed++;
        console.log(`Fetching object ${objectId}...`);

        const obj = await fetchObject(objectId);
        if (!obj) {
            rejected++;
            continue;
        }

        const validation = validateObject(obj);
        const auditEntry = createAuditEntry(obj, validation.valid, validation.reason);
        auditEntries.push(auditEntry);

        if (!validation.valid) {
            console.log(`Rejected ${objectId}: ${validation.reason}`);
            rejected++;
            continue;
        }

        const artwork = convertToArtwork(obj);
        artworks.push(artwork);
        accepted++;
        console.log(`Accepted ${objectId}: ${artwork.title}`);

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\nProcessing complete:`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Accepted: ${accepted}`);
    console.log(`  Rejected: ${rejected}`);

    // Generate runtime catalog
    const runtimeCatalog: RuntimeCatalog = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: 'The Metropolitan Museum of Art Open Access',
        artworkCount: artworks.length,
        artworks,
    };

    // Generate audit log
    const auditLog: AuditLog = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: 'The Metropolitan Museum of Art Collection API',
        totalProcessed: processed,
        totalAccepted: accepted,
        totalRejected: rejected,
        entries: auditEntries,
    };

    // Write files
    await fs.mkdir(config.outputDir, { recursive: true });

    const catalogPath = path.join(config.outputDir, 'paintings.json');
    const auditPath = path.join(config.outputDir, 'audit.json');

    await fs.writeFile(catalogPath, JSON.stringify(runtimeCatalog, null, 2));
    await fs.writeFile(auditPath, JSON.stringify(auditLog, null, 2));

    console.log(`\nCatalog written to: ${catalogPath}`);
    console.log(`Audit log written to: ${auditPath}`);
}

/**
 * Main entry point.
 */
async function main() {
    const config: GeneratorConfig = {
        maxArtworks: 50,
        outputDir: path.join(process.cwd(), 'packages', 'companion', 'resources'),
    };

    try {
        await generateCatalog(config);
        console.log('\n✓ Catalog generation complete!');
    } catch (error) {
        console.error('Catalog generation failed:', error);
        process.exit(1);
    }
}

main();
