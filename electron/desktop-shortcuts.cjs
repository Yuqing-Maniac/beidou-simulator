const fs = require('node:fs');
const path = require('node:path');

function quoteDesktop(value) {
  return '"' + String(value).replace(/["\\]/g, '\\$&') + '"';
}

function ensureDesktopShortcut({ app, shell, execPath, portableExecutable, platform }) {
  if (!app.isPackaged) return { created: false, reason: 'development' };
  const name = '北辰导航模拟器';
  const shortcut = path.join(app.getPath('desktop'), name + (platform === 'win32' ? '.lnk' : platform === 'linux' ? '.desktop' : ''));
  try {
    if (platform === 'win32') {
      const target = portableExecutable || execPath;
      if (!fs.existsSync(shortcut) && !shell.writeShortcutLink(shortcut, {
        target,
        icon: target,
        iconIndex: 0,
        description: '北辰 · 导航模拟器',
      })) throw new Error('Windows did not create the desktop shortcut');
    } else if (platform === 'linux') {
      if (!fs.existsSync(shortcut)) {
        const bundledIcon = path.posix.join(path.posix.dirname(execPath), 'icon.png');
        const content = [
          '[Desktop Entry]',
          'Type=Application',
          'Name=' + name,
          'Comment=北辰 · 导航模拟器',
          'Exec=' + quoteDesktop(execPath),
          'Icon=' + bundledIcon,
          'Terminal=false',
          'Categories=Utility;Development;',
          'StartupNotify=true',
          '',
        ].join('\n');
        fs.writeFileSync(shortcut, content, { mode: 0o755 });
      }
    } else return { created: false, reason: 'unsupported-platform' };
    return { created: true, shortcut };
  } catch (error) {
    console.warn('Desktop shortcut creation failed:', error);
    return { created: false, error: error.message, shortcut };
  }
}

module.exports = { ensureDesktopShortcut, quoteDesktop };
