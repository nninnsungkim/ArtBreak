import { glob } from 'glob';
import { run } from 'node:test';
import { spec as specReporter } from 'node:test/reporters';

async function runTests() {
    const testFiles = await glob('out/test/**/*.test.js');

    if (testFiles.length === 0) {
        console.error('No test files found');
        process.exit(1);
    }

    const stream = run({
        files: testFiles,
    });

    stream.compose(specReporter).pipe(process.stdout);

    let hasFailures = false;

    for await (const event of stream) {
        if (event.type === 'test:fail') {
            hasFailures = true;
        }
    }

    process.exit(hasFailures ? 1 : 0);
}

runTests().catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
});
