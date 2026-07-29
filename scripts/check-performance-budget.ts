import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_ASSET_BYTES = 500 * 1024;
const applicationEntryDirectory = path.resolve('.next/static/chunks/app');

async function collectJavaScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectJavaScriptFiles(entryPath);
      return entry.name.endsWith('.js') ? [entryPath] : [];
    }),
  );
  return files.flat();
}

try {
  const assets = await collectJavaScriptFiles(applicationEntryDirectory);
  if (assets.length === 0) {
    throw new Error(
      'No application entry assets found. Run npm run build before checking the budget.',
    );
  }

  const oversizedAssets = [];
  for (const asset of assets) {
    const { size } = await stat(asset);
    if (size > MAX_ASSET_BYTES) oversizedAssets.push({ asset, size });
  }

  if (oversizedAssets.length > 0) {
    const details = oversizedAssets
      .map(
        ({ asset, size }) =>
          `- ${path.relative(process.cwd(), asset)}: ${(size / 1024).toFixed(1)} KB`,
      )
      .join('\n');
    throw new Error(
      `Application entry asset budget exceeded (500 KB per emitted JavaScript asset):\n${details}`,
    );
  }

  console.log(
    `Performance budget passed: ${assets.length} application entry assets are each within 500 KB.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
