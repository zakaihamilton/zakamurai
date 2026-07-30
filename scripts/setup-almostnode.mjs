import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = 'node_modules/almostnode/dist';
const runtimeDestination = 'public/lib/almostnode';
const assetDestination = 'public/assets';
const resolverMarkers = ['range = range.trim();', 'range2 = range2.trim();'];

function patchResolver(filePath) {
  const sourceCode = readFileSync(filePath, 'utf8');
  const resolverMarker = resolverMarkers.find((marker) => sourceCode.includes(marker));
  const markerOccurrences = resolverMarker ? sourceCode.split(resolverMarker).length - 1 : 0;

  if (markerOccurrences !== 1) {
    throw new Error(`Expected one npm resolver marker in ${filePath}, found ${markerOccurrences}.`);
  }

  const rangeVariable = resolverMarker.startsWith('range2') ? 'range2' : 'range';
  const resolverPatch = `${resolverMarker}\n  // almostnode 0.2.14 requires all three semver segments in ranges.\n  ${rangeVariable} = ${rangeVariable}\n    .replace(/(^|\\s)(>=|<=|>|<|=)\\s*(\\d+)(?:\\.(\\d+))?(?=\\s|$)/g, (_match, prefix, operator, major, minor) => prefix + operator + major + \".\" + (minor || \"0\") + \".0\")\n    .replace(/([~^])\\s*(\\d+)(?:\\.(\\d+))?(?=\\s|$)/g, (_match, operator, major, minor) => operator + major + \".\" + (minor || \"0\") + \".0\");`;
  writeFileSync(filePath, sourceCode.replace(resolverMarker, resolverPatch));
}

mkdirSync(runtimeDestination, { recursive: true });
mkdirSync(assetDestination, { recursive: true });
cpSync(source, runtimeDestination, { recursive: true });
cpSync(join(source, 'assets'), assetDestination, { recursive: true });

patchResolver(join(runtimeDestination, 'index.mjs'));

for (const asset of readdirSync(join(runtimeDestination, 'assets'))) {
  if (asset.startsWith('runtime-worker-') && asset.endsWith('.js')) {
    patchResolver(join(runtimeDestination, 'assets', asset));
    patchResolver(join(assetDestination, asset));
  }
}
