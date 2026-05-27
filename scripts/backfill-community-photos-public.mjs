import admin from 'firebase-admin';
import { getFirebaseAdminConfig } from './firebase-config.mjs';

const dryRun = process.argv.includes('--dry-run');
const { databaseURL } = getFirebaseAdminConfig();

admin.initializeApp({ databaseURL });

const db = admin.database();

const buildPublicCommunityPhoto = (photo) => {
  const status = String(photo?.status || '').toLowerCase();
  const target = String(photo?.target || 'gallery_public');
  const title = String(photo?.title || '').trim();
  const imageUri = String(photo?.imageUri || photo?.downloadUrl || photo?.storagePath || '').trim();
  const storagePath = String(photo?.storagePath || '').trim();
  if (status !== 'approved' || target === 'my_photos' || (!imageUri && !storagePath)) return null;

  const publicPhoto = {
    title: title || 'Photo',
    description: String(photo.description || '').trim(),
    imageUri: imageUri || storagePath,
    uploadedBy: String(photo.uploadedBy || photo.userName || 'Anonymous').trim(),
    createdAt: Number(photo.createdAt || photo.uploadedAt || Date.now()),
    uploadedAt: Number(photo.uploadedAt || photo.createdAt || Date.now()),
    status: 'approved',
    target: 'gallery_public',
    likes: Number(photo.likes || 0),
  };

  if (storagePath) publicPhoto.storagePath = storagePath;
  if (typeof photo.userId === 'string' && photo.userId.trim()) publicPhoto.userId = photo.userId.trim();
  if (typeof photo.locationLabel === 'string' && photo.locationLabel.trim()) publicPhoto.locationLabel = photo.locationLabel.trim();
  if (photo.locationType === 'building' || photo.locationType === 'place') publicPhoto.locationType = photo.locationType;
  if (Number.isFinite(Number(photo.moderatedAt))) publicPhoto.moderatedAt = Number(photo.moderatedAt);

  return publicPhoto;
};

const snapshot = await db.ref('community_photos').once('value');
const raw = snapshot.val() || {};
const updates = {};
let publicCount = 0;
let hiddenCount = 0;

for (const [id, photo] of Object.entries(raw)) {
  const publicPhoto = buildPublicCommunityPhoto(photo || {});
  updates[`community_photos_public/${id}`] = publicPhoto;
  if (publicPhoto) publicCount += 1;
  else hiddenCount += 1;
}

console.log(`community_photos scanned: ${Object.keys(raw).length}`);
console.log(`public approved photos: ${publicCount}`);
console.log(`hidden/removed from public: ${hiddenCount}`);

if (dryRun) {
  console.log('Dry run only. No writes performed.');
} else {
  await db.ref().update(updates);
  console.log('community_photos_public backfill complete.');
}
