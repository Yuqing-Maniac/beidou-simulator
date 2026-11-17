#!/usr/bin/env node
// Assemble the documented portable layout and fail on any missing build output or icon.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const child = require('node:child_process');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release');
const meta = require(path.join(root, 'package.json'));
const platform = process.argv[2];
if (!['win', 'linux-arm64'].includes(platform)) throw new Error('Usage: node scripts/assemble-release.cjs win|linux-arm64');
const product = 'BeidouSimulator';
const folder = `${product}_${meta.version}`;
const windows = platform === 'win';
const entry = `${product}.${windows ? 'exe' : 'sh'}`;
const platformName = windows ? 'Windows10-11-x64' : 'KylinV10-ARM64';
const archive = path.join(release, `${product}_${meta.version}_${platformName}_Portable.${windows ? 'zip' : 'tar.gz'}`);
const stage = path.join(release, `stage-${platform}`);
const payload = path.join(stage, folder);

function run(command, args) {
  const result = child.spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function walk(directory, base = directory) {
  if (!fs.existsSync(directory)) throw new Error(`Missing build input: ${directory}`);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute, base) : [path.relative(base, absolute).replaceAll(path.sep, '/')];
  }).sort();
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function psQuote(value) { return "'" + value.replaceAll("'", "''") + "'"; }

for (const icon of ['public/icon.ico', 'public/icon.png']) {
  if (!fs.existsSync(path.join(root, icon)) || fs.statSync(path.join(root, icon)).size === 0) throw new Error(`Missing icon: ${icon}`);
}
if (!fs.existsSync(path.join(root, 'dist/.vite/manifest.json'))) throw new Error('Vite manifest is missing; rebuild with the current configuration');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/.vite/manifest.json'), 'utf8'));
if (!Object.keys(manifest).some(key => key.endsWith('index.html'))) throw new Error('Vite application entry is missing');
const expectedFiles = [...walk(path.join(root, 'dist')).map(name => `dist/${name}`), ...walk(path.join(root, 'electron')).map(name => `electron/${name}`)];
if (expectedFiles.some(name => name.endsWith('.map'))) throw new Error('Source maps must not be packaged');
const unpacked = path.join(release, windows ? 'win-unpacked' : 'linux-unpacked');
const appAsar = path.join(unpacked, 'resources/app.asar');
if (!fs.existsSync(appAsar)) throw new Error(`Missing packaged application: ${appAsar}`);
const packaged = new Set(asar.listPackage(appAsar).map(name => name.replace(/^[/\\]+/, '').replaceAll('\\', '/')));
for (const required of expectedFiles) {
  if (!packaged.has(required)) throw new Error(`Required runtime file is absent from app.asar: ${required}`);
}
for (const name of packaged) if (name.endsWith('.map')) throw new Error(`Source map found in app.asar: ${name}`);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(payload, { recursive: true });
fs.copyFileSync(path.join(root, 'docs/RELEASE_NOTES.md'), path.join(payload, 'RELEASE_NOTES.md'));
fs.copyFileSync(path.join(root, 'public/icon.png'), path.join(payload, 'icon.png'));
fs.rmSync(archive, { force: true });

if (windows) {
  const builtEntry = path.join(release, `beidou-simulator-${meta.version}-win-x64.exe`);
  if (!fs.existsSync(builtEntry)) throw new Error(`Missing portable executable: ${builtEntry}`);
  fs.copyFileSync(builtEntry, path.join(stage, entry));
  fs.copyFileSync(appAsar, path.join(payload, 'app.asar'));
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -LiteralPath ${psQuote(path.join(stage, entry))},${psQuote(payload)} -DestinationPath ${psQuote(archive)} -CompressionLevel Optimal`]);
  const entries = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem;$z=[IO.Compression.ZipFile]::OpenRead(${psQuote(archive)});try{$z.Entries.FullName}finally{$z.Dispose()}`]).split(/\r?\n/).filter(Boolean);
  const top = [...new Set(entries.map(name => name.replaceAll('\\', '/').split('/')[0]))].sort();
  if (top.length !== 2 || !top.includes(entry) || !top.includes(folder)) throw new Error(`Windows archive must contain exactly one folder and one executable: ${top.join(', ')}`);
  for (const required of [`${folder}/app.asar`, `${folder}/icon.png`, `${folder}/RELEASE_NOTES.md`]) {
    if (!entries.some(name => name.replaceAll('\\', '/') === required)) throw new Error(`Archive is missing ${required}`);
  }
} else {
  fs.cpSync(unpacked, payload, { recursive: true });
  fs.copyFileSync(path.join(root, 'public/icon.png'), path.join(payload, 'icon.png'));
  const launcher = `#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/${folder}/beidou-simulator" "$@"\n`;
  fs.writeFileSync(path.join(stage, entry), launcher, { mode: 0o755 });
  run('tar', ['-czf', archive, '-C', stage, folder, entry]);
  const entries = run('tar', ['-tzf', archive]).split(/\r?\n/).filter(Boolean);
  const top = [...new Set(entries.map(name => name.replace(/^\.\//, '').split('/')[0]))].sort();
  if (top.length !== 2 || !top.includes(entry) || !top.includes(folder)) throw new Error(`Linux archive must contain exactly one folder and one launcher: ${top.join(', ')}`);
  for (const required of [`${folder}/beidou-simulator`, `${folder}/resources/app.asar`, `${folder}/icon.png`, `${folder}/RELEASE_NOTES.md`]) {
    if (!entries.some(name => name.replace(/^\.\//, '') === required)) throw new Error(`Archive is missing ${required}`);
  }
}
const result = { file: path.basename(archive), bytes: fs.statSync(archive).size, sha256: sha256(archive) };
fs.writeFileSync(path.join(release, 'SHA256SUMS.txt'), `${result.sha256}  ${result.file}\n`, 'ascii');
console.log(JSON.stringify(result, null, 2));
