import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type TactileIconProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  iconSize?: number;
  tint?: string;
  backgroundColor?: string;
  borderColor?: string;
  style?: ViewStyle;
};

export default function TactileIcon({
  icon,
  size = 46,
  iconSize = 22,
  tint = '#FFF6DE',
  backgroundColor = '#3B352E',
  borderColor = 'rgba(255,255,255,0.16)',
  style,
}: TactileIconProps) {
  return (
    <View
      style={[
        styles.shell,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
          backgroundColor,
          borderColor,
        },
        style,
      ]}
    >
      <View style={styles.gloss} />
      <View style={styles.innerRing} />
      <MaterialCommunityIcons name={icon} size={iconSize} color={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  innerRing: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
  },
});
