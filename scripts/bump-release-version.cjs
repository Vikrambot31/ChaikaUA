const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const siteDir = path.join(root, 'chaika-site');
const siteReleaseDir = path.join(siteDir, 'release');

const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const writeText = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value, 'utf8');
const stripBom = (text) => text.replace(/^\uFEFF/, '');
const readJson = (relativePath) => JSON.parse(stripBom(readText(relativePath)));
const writeJson = (relativePath, value) => {
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
};

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const buildDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const buildStamp = `${buildDate}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

const packageJson = readJson('package.json');
const currentVersion = String(packageJson.version || '1.0.0');
const parts = currentVersion.split('.').map((part) => Number.parseInt(part, 10));
while (parts.length < 3) parts.push(0);
const nextVersion = `${parts[0] || 0}.${parts[1] || 0}.${(parts[2] || 0) + 1}`;
const apkFileName = `ChaikaLife-v${nextVersion}-${buildStamp}.apk`;
const apkRelativeUrl = `release/${apkFileName}`;

packageJson.version = nextVersion;
writeJson('package.json', packageJson);

const packageLock = readJson('package-lock.json');
packageLock.version = nextVersion;
if (packageLock.packages && packageLock.packages['']) {
  packageLock.packages[''].version = nextVersion;
}
writeJson('package-lock.json', packageLock);

const appJson = readJson('app.json');
appJson.expo = appJson.expo || {};
appJson.expo.version = nextVersion;
writeJson('app.json', appJson);

const versionConfig = readJson('app-version.json');
versionConfig.latestVersion = nextVersion;
versionConfig.minSupportedVersion = nextVersion;
versionConfig.lastVersionDate = buildDate;
versionConfig.lastBuildStamp = buildStamp;
versionConfig.androidUrl = `https://chaika-life.netlify.app/${apkRelativeUrl}`;
writeJson('app-version.json', versionConfig);
writeJson(path.join('chaika-site', 'app-version.json'), versionConfig);

if (!fs.existsSync(siteReleaseDir)) {
  fs.mkdirSync(siteReleaseDir, { recursive: true });
}

writeJson(path.join('chaika-site', 'release', 'latest.json'), {
  version: nextVersion,
  buildDate,
  buildStamp,
  apkFile: apkFileName,
  apkUrl: apkRelativeUrl,
});

const siteIndexPath = path.join('chaika-site', 'index.html');
if (fs.existsSync(path.join(root, siteIndexPath))) {
  let siteIndex = readText(siteIndexPath);
  siteIndex = siteIndex
    .replace(/Р’РµСЂСЃС–СЏ\s+\d+\.\d+\.\d+/g, `Р’РµСЂСЃС–СЏ ${nextVersion}`)
    .replace(/href="(?:https?:\/\/[^\"]+\/)?release\/[^"]+\.apk"/g, `href="${apkRelativeUrl}"`);
  writeText(siteIndexPath, siteIndex);
}

let constants = readText('src/utils/constants.ts');
constants = constants
  .replace(/export const APP_VERSION = '[^']*';/, `export const APP_VERSION = '${nextVersion}';`)
  .replace(/export const APP_BUILD_DATE = '[^']*';/, `export const APP_BUILD_DATE = '${buildDate}';`);
if (!constants.includes('export const APP_BUILD_DATE')) {
  constants = constants.replace(
    /export const APP_VERSION = '[^']*';/,
    `export const APP_VERSION = '${nextVersion}';\nexport const APP_BUILD_DATE = '${buildDate}';`
  );
}
writeText('src/utils/constants.ts', constants);

let buildGradle = readText('android/app/build.gradle');
const versionCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);
const nextVersionCode = versionCodeMatch ? Number.parseInt(versionCodeMatch[1], 10) + 1 : 1;
buildGradle = buildGradle
  .replace(/versionCode\s+\d+/, `versionCode ${nextVersionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${nextVersion}"`);
writeText('android/app/build.gradle', buildGradle);

console.log(`VERSION=${nextVersion}`);
console.log(`VERSION_CODE=${nextVersionCode}`);
console.log(`BUILD_DATE=${buildDate}`);
console.log(`BUILD_STAMP=${buildStamp}`);

