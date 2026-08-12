/**
 * Regenerate the app's font files from the web app's variable Geist.
 *
 * Not run on every build — the output is committed, because it is a stable
 * binary and a Python toolchain is a lot to require of `npm ci`. Run it by hand
 * if `static/fonts/Geist-Variable.woff2` ever changes:
 *
 *   node mobile/scripts/fonts.mjs
 *
 * Requires `fonttools` and `brotli`:
 *
 *   python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
 *   FONT_PYTHON=/tmp/fontenv/bin/python node mobile/scripts/fonts.mjs
 *
 * Four static instances rather than the variable font: React Native picks a
 * face by family name, and its variable-font weight selection is inconsistent
 * across platforms. See src/theme/fonts.ts.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../static/fonts/Geist-Variable.woff2');
const OUT = resolve(HERE, '../assets/fonts');
const PYTHON = process.env.FONT_PYTHON ?? 'python3';

const script = `
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import os
src, outdir = ${JSON.stringify(SRC)}, ${JSON.stringify(OUT)}
os.makedirs(outdir, exist_ok=True)
for weight, name in [(400,'Regular'), (500,'Medium'), (600,'SemiBold'), (700,'Bold')]:
    f = instantiateVariableFont(TTFont(src), {'wght': weight}, inplace=True, updateFontNames=True)
    f.flavor = None
    f.save(f'{outdir}/Geist-{name}.ttf')
    print(f'Geist-{name}.ttf')
`;

try {
  const out = execFileSync(PYTHON, ['-c', script], { encoding: 'utf8' });
  console.log(`fonts: regenerated\n${out.trim()}`);
} catch (err) {
  console.error(
    'fonts: failed. This needs fonttools + brotli — see the header of this file.\n' +
      String(err.message ?? err)
  );
  process.exit(1);
}
