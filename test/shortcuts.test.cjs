const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureDesktopShortcut, quoteDesktop } = require('../electron/desktop-shortcuts.cjs');

function fixture(platform) {
  const desktop = fs.mkdtempSync(path.join(os.tmpdir(), 'beichen-shortcut-'));
  return {
    desktop,
    app: { isPackaged: true, getPath: name => name === 'desktop' ? desktop : (() => { throw new Error(name); })() },
    shell: { writeShortcutLink: (file, options) => { fs.writeFileSync(file, JSON.stringify(options)); return true; } },
    execPath: platform === 'win32' ? 'C:\\Apps\\BeidouSimulator.exe' : '/opt/BeidouSimulator/beidou-simulator',
    portableExecutable: platform === 'win32' ? 'C:\\Downloads\\BeidouSimulator.exe' : undefined,
    platform,
  };
}

test('packaged Windows first run creates an icon-bearing shortcut to the portable entry', t => {
  const f = fixture('win32'); t.after(() => fs.rmSync(f.desktop, { recursive: true, force: true }));
  const result = ensureDesktopShortcut(f);
  assert.equal(result.created, true);
  const options = JSON.parse(fs.readFileSync(result.shortcut, 'utf8'));
  assert.equal(options.target, f.portableExecutable);
  assert.equal(options.icon, f.portableExecutable);
  ensureDesktopShortcut(f);
});

test('packaged Linux first run creates a desktop launcher with executable and external icon', t => {
  const f = fixture('linux'); t.after(() => fs.rmSync(f.desktop, { recursive: true, force: true }));
  const result = ensureDesktopShortcut(f);
  assert.equal(result.created, true);
  const entry = fs.readFileSync(result.shortcut, 'utf8');
  assert.match(entry, /Exec="\/opt\/BeidouSimulator\/beidou-simulator"/);
  assert.match(entry, /Icon=\/opt\/BeidouSimulator\/icon\.png/);
  assert.match(entry, /Name=北辰导航模拟器/);
});

test('development and unsupported platforms do not create shortcuts', () => {
  assert.equal(ensureDesktopShortcut({ app: { isPackaged: false } }).created, false);
  assert.equal(ensureDesktopShortcut({ ...fixture('darwin'), execPath: '/tmp/app' }).created, false);
  assert.equal(quoteDesktop('a"b'), '"a\\"b"');
});
