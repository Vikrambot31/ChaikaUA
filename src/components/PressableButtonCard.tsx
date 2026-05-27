import React, { useRef, useState } from 'react';
import {
  TouchableOpacity,
  View,
  Image,
  StyleSheet,
  Animated,
  ImageSourcePropType,
} from 'react-native';

interface PressableButtonCardProps {
  imageSource: ImageSourcePropType;
  onPress: () => void;
}

const PressableButtonCard: React.FC<PressableButtonCardProps> = ({
  imageSource,
  onPress,
}) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const [shadowOpacity] = useState(new Animated.Value(0.1));

  const handlePressIn = () => {
    Animated.timing(scaleValue, { toValue: 0.95, duration: 100, useNativeDriver: true }).start();
    Animated.timing(shadowOpacity, { toValue: 0.3, duration: 100, useNativeDriver: false }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleValue, { toValue: 1, duration: 100, useNativeDriver: true }).start();
    Animated.timing(shadowOpacity, { toValue: 0.1, duration: 100, useNativeDriver: false }).start();
  };

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale: scaleValue }],
          flex: 1,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="contain"
        />
        {/* Тень только снизу */}
        <View style={styles.bottomShadow} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  bottomShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});

export default PressableButtonCard;
