import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Place, PlaceType } from '../types/app';
import { SCREEN_THEME } from '../utils/screenTheme';

interface PlaceMarkerProps {
  place: Place;
  selected?: boolean;
}

const TYPE_LABELS: Record<PlaceType, string> = {
  [PlaceType.SHOP]: 'М',
  [PlaceType.SCHOOL]: 'Ш',
  [PlaceType.KINDERGARTEN]: 'Д',
  [PlaceType.CAFE]: 'К',
  [PlaceType.SERVICE]: 'У',
  [PlaceType.PHARMACY]: 'А',
  [PlaceType.SALON]: 'С',
  [PlaceType.RESTAURANT]: 'Р',
  [PlaceType.BUILDING]: 'Б',
};

const TYPE_COLORS: Record<PlaceType, string> = {
  [PlaceType.SHOP]: SCREEN_THEME.terracotta,
  [PlaceType.SCHOOL]: SCREEN_THEME.enamelBlue,
  [PlaceType.KINDERGARTEN]: '#4F8D5F',
  [PlaceType.CAFE]: SCREEN_THEME.woodGreen,
  [PlaceType.SERVICE]: '#5E6FA8',
  [PlaceType.PHARMACY]: '#C79C47',
  [PlaceType.SALON]: '#8A7AB1',
  [PlaceType.RESTAURANT]: '#B8713E',
  [PlaceType.BUILDING]: '#315B72',
};

const PlaceMarker: React.FC<PlaceMarkerProps> = ({ place, selected }) => {
  const size = selected ? 44 : 34;
  const radius = size / 2;
  return (
    <View style={[styles.container, { backgroundColor: TYPE_COLORS[place.type], width: size, height: size, borderRadius: radius, borderWidth: selected ? 3 : 2, borderColor: selected ? '#FFFFFF' : '#FBF8FD' }]}>
      <View style={styles.gloss} />
      <Text style={[styles.label, selected && styles.labelSelected]}>{TYPE_LABELS[place.type]}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FBF8FD',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    overflow: 'hidden',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  labelSelected: {
    fontSize: 15,
  },
});

export default PlaceMarker;

