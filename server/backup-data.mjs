import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || resolve(HERE, 'data'));
const BACKUP_ROOT = resolve(process.env.BACKUP_DIR || resolve(DATA_DIR, 'backups'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = resolve(BACKUP_ROOT, stamp);

await mkdir(destination, { recursive: true });
const names = (await readdir(DATA_DIR)).filter((name) => /^(events|feedback)(?:-\d{4}-\d{2})?\.jsonl$/.test(name));
const files = [];
for (const name of names) {
  const source = resolve(DATA_DIR, name);
  const target = resolve(destination, name);
  await copyFile(source, target);
  const info = await stat(target);
  files.push({ name, bytes: info.size });
}
const manifest = { createdAt: new Date().toISOString(), source: DATA_DIR, files };
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(JSON.stringify({ ok: true, destination, files }, null, 2));
