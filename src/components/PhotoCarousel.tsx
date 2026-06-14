import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppPhotoImage from './AppPhotoImage';

type Props = {
  photoUris: string[];
  storagePaths?: string[];
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
};

export default function PhotoCarousel({ photoUris, storagePaths, width, height, style, borderRadius = 14 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!photoUris || photoUris.length === 0) {
    return (
      <AppPhotoImage
        uri=""
        style={[{ width, height, borderRadius }, style]}
        resizeMode="cover"
      />
    );
  }

  if (photoUris.length === 1) {
    return (
      <AppPhotoImage
        uri={photoUris[0] || ''}
        storagePath={storagePaths?.[0]}
        style={[{ width, height, borderRadius }, style]}
        resizeMode="cover"
      />
    );
  }

  const safeIndex = Math.min(activeIndex, photoUris.length - 1);

  const prevPhoto = () => setActiveIndex((i) => Math.max(0, i - 1));
  const nextPhoto = () => setActiveIndex((i) => Math.min(photoUris.length - 1, i + 1));

  return (
    <View style={[{ width, height, borderRadius, overflow: 'hidden' as const }, style]}>
      <AppPhotoImage
        uri={photoUris[safeIndex] || ''}
        storagePath={storagePaths?.[safeIndex]}
        style={{ width, height }}
        resizeMode="cover"
      />
      {/* Left tap zone */}
      {safeIndex > 0 && (
        <TouchableOpacity
          style={[styles.tapZone, styles.tapLeft]}
          onPress={prevPhoto}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="chevron-left" size={20} color="#fff" />
        </TouchableOpacity>
      )}
      {/* Right tap zone */}
      {safeIndex < photoUris.length - 1 && (
        <TouchableOpacity
          style={[styles.tapZone, styles.tapRight]}
          onPress={nextPhoto}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
        </TouchableOpacity>
      )}
      {/* Dot indicators */}
      <View style={styles.dots}>
        {photoUris.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => setActiveIndex(i)}>
            <View style={[styles.dot, i === safeIndex && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tapZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '30%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tapLeft: {
    left: 0,
  },
  tapRight: {
    right: 0,
  },
  dots: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    alignSelf: 'center',
    left: 0,
    right: 0,
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 2,
  },
  dotActive: {
    backgroundColor: '#fff',
  },
});
