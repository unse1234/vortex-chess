// Read-only documentation consistency checks. Run from any working directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (p) => fs.readdirSync(path.join(root, p), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(`${p}/${e.name}`) : [`${p}/${e.name}`]);
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const current = ['README.md', 'frontend/README.md', 'backend/README.md',
  ...['feature-catalog', 'user-guide', 'architecture', 'frontend', 'backend', 'api',
    'realtime', 'database', 'engine', 'security', 'deployment', 'testing', 'operations']
    .map((name) => `docs/${name}.md`)];
const historical = fs.readdirSync(path.join(root, 'docs'))
  .filter((name) => name.endsWith('.md') && !current.includes(`docs/${name}`))
  .map((name) => `docs/${name}`);
function slug(text) {
  return text.toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim().replace(/\s/g, '-');
}
function headings(text) {
  const counts = new Map();
  return text.split(/\r?\n/).filter((l) => /^#{1,6} /.test(l)).map((l) => {
    const base = slug(l.replace(/^#+ /, ''));
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  });
}
let links = 0;
for (const name of [...current, ...historical]) {
  const text = read(name);
  check(!text.includes('\uFFFD'), `${name}: replacement character`);
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    let href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    const [target, anchor] = href.split('#');
    const resolved = path.resolve(root, path.dirname(name), decodeURIComponent(target || path.basename(name)));
    links++;
    check(fs.existsSync(resolved), `${name}: missing link ${href}`);
    if (anchor && fs.existsSync(resolved) && resolved.endsWith('.md')) {
      const body = fs.readFileSync(resolved, 'utf8');
      check(headings(body).includes(decodeURIComponent(anchor)), `${name}: missing anchor ${href}`);
    }
  }
  if (!current.includes(name)) continue;
  let fence = false;
  let tableColumns = null;
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (/^```/.test(line)) { fence = !fence; tableColumns = null; continue; }
    if (fence) continue;
    if (line.startsWith('|')) {
      const cells = line.split(/(?<!\\)\|/).length - 2;
      if (tableColumns === null) tableColumns = cells;
      check(cells === tableColumns, `${name}:${i + 1}: inconsistent table columns`);
    } else tableColumns = null;
    for (const match of line.matchAll(/`((?:frontend\/|backend\/|\.husky\/)[^`]+)`/g)) {
      const ref = match[1];
      if (/[{}*?<>]|\s|\.\.\./.test(ref) || /(?:^|\/)\.env(?:\.local)?$/.test(ref)) continue;
      check(fs.existsSync(path.join(root, ref)), `${name}:${i + 1}: missing code path ${ref}`);
    }
  }
  check(!fence, `${name}: unbalanced code fences`);
}

const catalog = read('docs/feature-catalog.md');
const rows = catalog.split('\n').filter((l) => /^\| [ARGSO]\d\d \|/.test(l));
const ids = rows.map((r) => r.split('|')[1].trim());
check(ids.length === new Set(ids).size, 'Duplicate catalog IDs');
const counts = rows.reduce((acc, row) => {
  const status = row.split('|')[3].trim();
  acc[status] = (acc[status] ?? 0) + 1;
  return acc;
}, {});
for (const status of Object.keys(counts)) check(['Implemented', 'Partially implemented',
  'Mock/demo only', 'Disabled / Coming Soon'].includes(status), `Unknown status ${status}`);
check(rows.length === 79, `Catalog count changed: ${rows.length}; reconcile testing.md`);

const spec = JSON.parse(read('backend/openapi.json'));
let refs = 0;
function validateRefs(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref?.startsWith('#/')) {
    refs++;
    const found = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
    check(found !== undefined, `Unresolved OpenAPI reference ${value.$ref}`);
  }
  for (const child of Object.values(value)) validateRefs(child);
}
validateRefs(spec);
const normalize = (p) => p.replace(/\{[^}]+\}|:[^/]+/g, ':id').replace(/\/$/, '');
const sourceEndpoints = new Set();
for (const name of walk('backend/src/modules').filter((p) => p.endsWith('.ts') && !p.endsWith('.spec.ts'))) {
  const code = read(name);
  const base = /@Controller\((?:'([^']*)')?\)/.exec(code);
  if (!base) continue;
  for (const match of code.matchAll(/@(Get|Post|Patch|Delete)\((?:'([^']*)')?\)/g)) {
    const endpoint = `/${[base[1], match[2]].filter(Boolean).join('/')}`;
    const expanded = endpoint.includes(':action') ? ['accept', 'decline', 'cancel'].map((a) => endpoint.replace(':action', a)) : [endpoint];
    for (const p of expanded) sourceEndpoints.add(`${match[1].toUpperCase()} ${normalize(p)}`);
  }
}
const specEndpoints = new Set(Object.entries(spec.paths).flatMap(([p, methods]) => Object.keys(methods)
  .filter((m) => ['get', 'post', 'patch', 'delete'].includes(m)).map((m) => `${m.toUpperCase()} ${normalize(p)}`)));
const apiText = read('docs/api.md');
const docEndpoints = new Set([...apiText.matchAll(/\| (GET|POST|PATCH|DELETE) `\/api([^`]+)`/g)]
  .map((m) => `${m[1]} ${normalize(m[2])}`));
for (const endpoint of sourceEndpoints) {
  check(specEndpoints.has(endpoint), `Missing OpenAPI operation: ${endpoint}`);
  check(docEndpoints.has(endpoint), `Missing documented operation: ${endpoint}`);
}
for (const endpoint of specEndpoints) check(sourceEndpoints.has(endpoint), `OpenAPI without controller: ${endpoint}`);
for (const endpoint of docEndpoints) check(sourceEndpoints.has(endpoint), `Docs without controller: ${endpoint}`);
const routes = walk('frontend/src/app').filter((p) => p.endsWith('/page.tsx'));
const models = [...read('backend/prisma/schema.prisma').matchAll(/^model (\w+)/gm)].map((m) => m[1]);
const migrations = walk('backend/prisma/migrations').filter((p) => p.endsWith('/migration.sql'));
for (const model of models) check(read('docs/database.md').includes(`| ${model} |`), `Missing database model ${model}`);
const environment = read('backend/src/config/environment.ts');
for (const key of [...environment.matchAll(/^    ([A-Z][A-Z_]+):/gm)].map((m) => m[1]))
  check(read('docs/deployment.md').includes(key), `Undocumented environment key ${key}`);
for (const app of ['backend', 'frontend']) {
  const pkg = JSON.parse(read(`${app}/package.json`));
  const guides = current.map(read).join('\n');
  for (const script of Object.keys(pkg.scripts)) check(guides.includes(script), `Undocumented ${app} script ${script}`);
}
const assets = JSON.parse(read('frontend/public/audio/asset-inventory.json'));
for (const asset of assets) {
  const file = path.join(root, 'frontend/public/audio', asset.file);
  check(fs.existsSync(file), `Missing audio ${asset.file}`);
  if (fs.existsSync(file)) check(createHash('sha256').update(fs.readFileSync(file)).digest('hex') === asset.sha256,
    `Audio hash mismatch ${asset.file}`);
}

console.log(JSON.stringify({ markdownFiles: current.length + historical.length, localLinks: links,
  featureUnits: rows.length, statuses: counts, httpOperations: sourceEndpoints.size,
  openApiReferences: refs, frontendPages: routes.length, prismaModels: models.length,
  migrations: migrations.length, audioAssets: assets.length }, null, 2));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Documentation consistency checks passed. External URLs and runtime journeys were not tested.');
