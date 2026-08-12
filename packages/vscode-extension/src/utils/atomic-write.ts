import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Atomically writes JSON data to a file.
 *
 * Pattern: serialize -> write temp sibling -> rename/replace
 *
 * This ensures that the target file is never partially written,
 * even if the process crashes during the write.
 */
export async function atomicWriteJSON(
    filePath: string,
    data: unknown
): Promise<void> {
    // Serialize the data
    const content = JSON.stringify(data, null, 2);

    // Create a unique temporary filename in the same directory
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const tempPath = path.join(dir, `.${basename}.tmp.${randomSuffix}`);

    try {
        // Ensure the directory exists
        await fs.mkdir(dir, { recursive: true });

        // Write to the temporary file
        await fs.writeFile(tempPath, content, 'utf8');

        // Atomically rename/replace the target file
        // On Windows, this may fail if the file is open; we'll handle that gracefully
        await fs.rename(tempPath, filePath);
    } catch (error) {
        // Clean up the temp file if something went wrong
        try {
            await fs.unlink(tempPath);
        } catch {
            // Ignore cleanup errors
        }
        throw error;
    }
}

/**
 * Reads and parses a JSON file.
 * Returns null if the file doesn't exist.
 * Throws if the file exists but is invalid JSON.
 */
export async function readJSON<T = unknown>(
    filePath: string
): Promise<T | null> {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content) as T;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

/**
 * Safely deletes a file if it exists.
 * Does not throw if the file doesn't exist.
 */
export async function safeUnlink(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}
