import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImageSourcePropType } from 'react-native';

export const START_AVATAR_STORAGE_KEY = '@chaika:selected_start_avatar:v1';

export type StartAvatar = {
  key: string;
  uri: string;
  source: ImageSourcePropType;
};

export const START_AVATAR_URI_PREFIX = 'start-avatar://';

export const START_AVATARS: StartAvatar[] = [
  { key: '1', uri: `${START_AVATAR_URI_PREFIX}1`, source: require('../../assets/Avatar-start/1.png') },
  { key: '2', uri: `${START_AVATAR_URI_PREFIX}2`, source: require('../../assets/Avatar-start/2.png') },
  { key: '3', uri: `${START_AVATAR_URI_PREFIX}3`, source: require('../../assets/Avatar-start/3.png') },
  { key: '4', uri: `${START_AVATAR_URI_PREFIX}4`, source: require('../../assets/Avatar-start/4.png') },
  { key: '5', uri: `${START_AVATAR_URI_PREFIX}5`, source: require('../../assets/Avatar-start/5.png') },
  { key: '6', uri: `${START_AVATAR_URI_PREFIX}6`, source: require('../../assets/Avatar-start/6.png') },
];

export const getStartAvatarByKey = (key?: string | null): StartAvatar | undefined =>
  START_AVATARS.find((avatar) => avatar.key === key);

export const getStartAvatarByUri = (uri?: unknown): StartAvatar | undefined => {
  if (typeof uri !== 'string') return undefined;
  if (!uri.startsWith(START_AVATAR_URI_PREFIX)) return undefined;
  return getStartAvatarByKey(uri.replace(START_AVATAR_URI_PREFIX, ''));
};

export const getSelectedStartAvatar = async (): Promise<StartAvatar | null> => {
  const key = await AsyncStorage.getItem(START_AVATAR_STORAGE_KEY);
  return getStartAvatarByKey(key) ?? null;
};

export const saveSelectedStartAvatar = async (key: string): Promise<StartAvatar | null> => {
  const avatar = getStartAvatarByKey(key);
  if (!avatar) return null;
  await AsyncStorage.setItem(START_AVATAR_STORAGE_KEY, key);
  return avatar;
};

export const clearSelectedStartAvatar = async (): Promise<void> => {
  await AsyncStorage.removeItem(START_AVATAR_STORAGE_KEY);
};
