/**
 * Type definitions for The Met catalog generation.
 */

/**
 * Artwork record in the runtime catalog.
 */
export interface Artwork {
    /** The Met object ID */
    objectID: number;

    /** Artwork title */
    title: string;

    /** Artist name(s) */
    artist: string;

    /** Year or date string */
    date: string;

    /** Culture or origin */
    culture: string;

    /** Direct image URL (must be from images.metmuseum.org) */
    imageUrl: string;

    /** Department */
    department: string;

    /** Medium */
    medium: string;

    /** Credit line */
    creditLine: string;
}

/**
 * Runtime catalog schema (embedded in companion).
 */
export interface RuntimeCatalog {
    schemaVersion: 1;
    generatedAt: string;
    source: string;
    artworkCount: number;
    artworks: Artwork[];
}

/**
 * Audit log entry for provenance tracking.
 */
export interface AuditEntry {
    objectID: number;
    title: string;
    artist: string;
    apiUrl: string;
    imageUrl: string;
    isPublicDomain: boolean;
    classification: string;
    fetchedAt: string;
}

/**
 * Audit log schema.
 */
export interface AuditLog {
    schemaVersion: 1;
    generatedAt: string;
    source: string;
    totalProcessed: number;
    totalAccepted: number;
    totalRejected: number;
    entries: AuditEntry[];
}

/**
 * The Met Object API response (partial).
 */
export interface MetObjectResponse {
    objectID: number;
    isPublicDomain: boolean;
    primaryImage: string;
    primaryImageSmall: string;
    title: string;
    artistDisplayName: string;
    objectDate: string;
    culture: string;
    department: string;
    objectName: string;
    classification: string;
    medium: string;
    creditLine: string;
}
