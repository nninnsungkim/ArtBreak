import { copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await copyFile(
    resolve(packageRoot, 'resources', 'paintings.json'),
    resolve(packageRoot, 'ui', 'paintings.json')
);
await copyFile(
    resolve(packageRoot, 'resources', 'paintings.json'),
    resolve(packageRoot, 'ui', 'paintings-v3.json')
);
await copyFile(
    resolve(packageRoot, 'ui', 'app.js'),
    resolve(packageRoot, 'ui', 'app-v3.js')
);
await copyFile(
    resolve(packageRoot, 'ui', 'app.js'),
    resolve(packageRoot, 'ui', 'app-v4.js')
);
await copyFile(
    resolve(packageRoot, 'ui', 'styles.css'),
    resolve(packageRoot, 'ui', 'styles-v4.css')
);
