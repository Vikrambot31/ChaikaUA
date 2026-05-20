const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'CHAIKA panel-1.mp4');
const backup = `${source}.apkbuildbak`;
const temp = path.join(process.env.TEMP || root, 'chaika-panel-1-apkbuild.mp4');
const mode = process.argv[2];

const copy = (from, to) => fs.copyFileSync(from, to);
const removeIfExists = (filePath) => {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
};

const restore = () => {
  if (fs.existsSync(backup)) {
    copy(backup, source);
    removeIfExists(backup);
    console.log('[INFO] Original source video restored.');
  }
};

if (mode === 'restore') {
  restore();
  process.exit(0);
}

if (mode !== 'prepare') {
  console.error('[ERROR] Usage: node scripts\\optimize-apk-video.cjs prepare|restore');
  process.exit(1);
}

const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
if (ffmpegCheck.status !== 0) {
  console.log('[WARN] ffmpeg not found. Video optimization skipped.');
  process.exit(0);
}

if (!fs.existsSync(source)) {
  console.log(`[WARN] Main video not found, skipping: ${source}`);
  process.exit(0);
}

restore();

const originalSize = fs.statSync(source).size;
copy(source, backup);
removeIfExists(temp);

const ffmpeg = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    source,
    '-an',
    '-vf',
    'scale=-2:720',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '29',
    '-movflags',
    '+faststart',
    temp,
  ],
  { stdio: 'inherit' }
);

if (ffmpeg.status !== 0 || !fs.existsSync(temp)) {
  console.log('[WARN] ffmpeg video optimization failed. Using original video.');
  restore();
  process.exit(0);
}

const optimizedSize = fs.statSync(temp).size;
if (optimizedSize >= originalSize) {
  console.log('[WARN] Optimized video is not smaller. Using original video.');
  restore();
  process.exit(0);
}

copy(temp, source);
console.log('[INFO] Video optimized for this build only.');
console.log(`[INFO] Original video size  : ${originalSize} bytes`);
console.log(`[INFO] APK build video size : ${optimizedSize} bytes`);
