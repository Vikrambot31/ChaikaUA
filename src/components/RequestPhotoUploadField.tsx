import React from 'react';
import PhotoUploadField, { UploadedPhoto } from './PhotoUploadField';

type Props = {
  uid: string;
  userName: string;
  maxPhotos?: number;
  onPhotosChange: (photos: UploadedPhoto[]) => void;
  onBeforePickerOpen?: () => void | Promise<void>;
};

export type { UploadedPhoto };

export default function RequestPhotoUploadField({
  uid,
  userName,
  maxPhotos = 1,
  onPhotosChange,
  onBeforePickerOpen,
}: Props) {
  return (
    <PhotoUploadField
      uid={uid}
      userName={userName}
      maxPhotos={maxPhotos}
      storagePath="requests"
      onPhotosChange={onPhotosChange}
      onBeforePickerOpen={onBeforePickerOpen}
    />
  );
}
