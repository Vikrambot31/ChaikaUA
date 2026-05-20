import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { storage } from '../firebase/firebase';

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const isStoragePath = (value: string): boolean => {
  if (!value || isHttpUrl(value) || value.startsWith('file:') || value.startsWith('content:')) return false;
  return /^(community_photos|test_photos|dating|dating_profiles|dating_anketa|coffee_requests|buy_sell|buy_sell_listings|contacts|contacts_listings|lost_found|local_business|requests)\//.test(value);
};

export const resolveMediaUrl = async (value: string): Promise<string> => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isHttpUrl(trimmed)) return trimmed;
  if (!isStoragePath(trimmed)) return '';

  try {
    return await getDownloadURL(storageRef(storage, trimmed));
  } catch (err) {
    console.warn('[mediaService] getDownloadURL failed for path:', trimmed, err);
    return '';
  }
};
