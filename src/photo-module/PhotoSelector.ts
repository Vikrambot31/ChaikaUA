import type { UserPhoto } from './types';

let selectHandler: ((photo: UserPhoto) => void) | null = null;

export const PhotoSelector = {
  open(navigation: { navigate: (...args: [string, object]) => void }, onSelect: (photo: UserPhoto) => void): void {
    selectHandler = onSelect;
    navigation.navigate('MyPhotosScreen', { selectMode: true });
  },

  select(photo: UserPhoto): void {
    const handler = selectHandler;
    selectHandler = null;
    handler?.(photo);
  },

  cancel(): void {
    selectHandler = null;
  },
};
