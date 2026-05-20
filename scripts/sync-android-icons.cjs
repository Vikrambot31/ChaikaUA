const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'Logo-Chaika LIFE-box.png');
const resRoot = path.join(root, 'android', 'app', 'src', 'main', 'res');

const densities = [
  ['mipmap-mdpi', 48, 108],
  ['mipmap-hdpi', 72, 162],
  ['mipmap-xhdpi', 96, 216],
  ['mipmap-xxhdpi', 144, 324],
  ['mipmap-xxxhdpi', 192, 432],
];

const ensureFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
};

const writeIcon = async (folder, fileName, size) => {
  const targetDir = path.join(resRoot, folder);
  fs.mkdirSync(targetDir, { recursive: true });
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: '#F7F3EE' })
    .png()
    .toFile(path.join(targetDir, fileName));
};

const main = async () => {
  ensureFile(source);
  for (const [folder, legacySize, adaptiveSize] of densities) {
    await writeIcon(folder, 'ic_launcher.png', legacySize);
    await writeIcon(folder, 'ic_launcher_round.png', legacySize);
    await writeIcon(folder, 'ic_launcher_foreground.png', adaptiveSize);
    await writeIcon(folder, 'ic_launcher_monochrome.png', adaptiveSize);
  }
  console.log('Android launcher icons synced from assets/Logo-Chaika LIFE-box.png');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
