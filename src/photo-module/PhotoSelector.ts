import type { UserPhoto } from './types';

let selectHandler: ((photo: UserPhoto) => void) | null = null;
let pendingPhoto: UserPhoto | null = null;

export const PhotoSelector = {
  open(navigation: { navigate: (...args: [string, object]) => void }, onSelect: (photo: UserPhoto) => void): void {
    selectHandler = onSelect;
    pendingPhoto = null;
    navigation.navigate('MyPhotosScreen', { selectMode: true });
  },

  select(photo: UserPhoto): void {
    pendingPhoto = photo;
    const handler = selectHandler;
    selectHandler = null;
    handler?.(photo);
  },

  /** Забирает фото, которое было выбрано (один раз — очищает после вызова).
   *  Используется PhotoUploadField при монтировании, если компонент был пересоздан
   *  во время навигации и потерял состояние. */
  consumePending(): UserPhoto | null {
    const photo = pendingPhoto;
    pendingPhoto = null;
    return photo;
  },

  cancel(): void {
    selectHandler = null;
    pendingPhoto = null;
  },
};
