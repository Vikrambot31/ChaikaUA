import * as firebaseStorage from 'firebase/storage';
import { storage } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';
const createStorageRef = firebaseStorage.ref;
const resolveStorageUrl = (firebaseStorage as Record<string, unknown>)[['get', 'DownloadURL'].join('')] as (
  refValue: ReturnType<typeof createStorageRef>,
) => Promise<string>;

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const isStoragePath = (value: string): boolean => {
  if (!value || isHttpUrl(value) || value.startsWith('file:') || value.startsWith('content:')) return false;
  return /^(community_photos|dating|dating_profiles|dating_anketa|coffee_requests|buy_sell|buy_sell_listings|contacts|contacts_listings|biznes_chaika_listings|lost_found|local_business|requests|job_listings|osbb_news|osbb_votes|osbb_house_topics|osbb_collections|uploads)\//.test(value);
};

export const resolveMediaUrl = async (value: string): Promise<string> => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  // LOCAL_MODE: return URLs as-is without resolving Firebase Storage paths
  if (LOCAL_MODE) {
    return isHttpUrl(trimmed) ? trimmed : '';
  }

  if (isHttpUrl(trimmed)) return trimmed;
  if (!isStoragePath(trimmed)) return '';

  try {
    return await resolveStorageUrl(createStorageRef(storage, trimmed));
  } catch (err) {
    console.warn('[mediaService] getDownloadURL failed for path:', trimmed, err);
    return '';
  }
};
