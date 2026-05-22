import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import AppPhotoImage from './AppPhotoImage';

const NO_FOTO = require('../../assets/WEBP-version/noFoto.webp');

type Props = {
  uri?: string;
  storagePath?: string;
  name?: string;
  size?: number;
  borderRadius?: number;
  backgroundColor?: string;
  textColor?: string;
};

const MiniUserAvatar: React.FC<Props> = ({
  uri,
  storagePath,
  name,
  size = 34,
  borderRadius,
  backgroundColor = '#4B7F9E',
}) => {
  const [failed, setFailed] = useState(false);
  const radius = borderRadius ?? Math.round(size / 2);
  const hasImage = Boolean(((uri && uri.trim().length > 0) || (storagePath && storagePath.trim().length > 0)) && !failed);

  useEffect(() => {
    setFailed(false);
  }, [uri, storagePath]);

  if (hasImage) {
    return (
      <AppPhotoImage
        uri={uri}
        storagePath={storagePath}
        style={[styles.avatarBase, styles.image, { width: size, height: size, borderRadius: radius }]}
        resizeMode="cover"
        fallbackText=""
        debugLabel={`MiniUserAvatar:${name || 'unknown'}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius, backgroundColor },
      ]}
    >
      <Image
        source={NO_FOTO}
        style={[styles.placeholderImage, { width: size, height: size, borderRadius: radius }]}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  avatarBase: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  image: {
    backgroundColor: '#E7DDD0',
  },
  fallback: {
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  placeholderImage: {
    opacity: 0.82,
  },
});

export default MiniUserAvatar;
