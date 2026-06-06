import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';

interface VideoLoadingOverlayProps {
  visible: boolean;
  text?: string;
}

const CIRCLE_SIZE = Dimensions.get('window').width * 0.55;

const CHAIKA_PHRASES = [
  'Цікаво, з ким тут можна познайомитися за кавою? ☕🕊️',
  'Усе ж таки моя улюблена крамниця — Зелена Лавка. 🕊️🌿',
  'Як же дістали ці мотоцикли. Вас теж? 🕊️🏍️😅',
  'І коли вже буде нормальна погода на Чайці? 🌦️🕊️😅',
  'Треба вже нарешті розповісти про свій бізнес у Чайка Life. 😏🕊️',
  'Досі не розумію, як ми жили без Чайка Life. 🕊️💙',
  'Хтось бачив, де тут найкраща кава? ☕🕊️',
  'Може, сьогодні познайомлюся з новими сусідами! 🏘️🕊️',
  'Цікаво, що нового у стрічці... 📱🕊️',
  'Чайка Life — це як сусідський чат, тільки краще! 🕊️✨',
];

function getRandomPhrase(): string {
  return CHAIKA_PHRASES[Math.floor(Math.random() * CHAIKA_PHRASES.length)];
}

export const VideoLoadingOverlay: React.FC<VideoLoadingOverlayProps> = ({
  visible,
  text = 'Завантаження екрану...',
}) => {
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Pick a random phrase each time overlay becomes visible
  const phrase = useMemo(() => getRandomPhrase(), [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) return;
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [visible, spinAnim]);

  if (!visible) return null;

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.overlay}>
      <View style={styles.content}>
        {/* Speech bubble above the video */}
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{phrase}</Text>
          <View style={styles.bubbleTail} />
        </View>

        {/* Circular video */}
        <View style={styles.videoContainer}>
          <Video
            source={require('../../assets/Download.mp4')}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay={visible}
            isLooping
            isMuted
          />
        </View>

        {/* Loading text */}
        <Text style={styles.text}>{text}</Text>

        {/* Spinner */}
        <Animated.View
          style={[
            styles.spinner,
            { transform: [{ rotate: spinInterpolation }] },
          ]}
        >
          <View style={styles.spinnerArc} />
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
  },
  bubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: CIRCLE_SIZE + 40,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  bubbleText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    lineHeight: 20,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  videoContainer: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  video: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
  },
  text: {
    marginTop: 24,
    fontSize: 16,
    color: '#555',
    fontWeight: '500',
  },
  spinner: {
    marginTop: 16,
    width: 32,
    height: 32,
  },
  spinnerArc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: '#4A90D9',
    borderRightColor: '#4A90D9',
  },
});

export default VideoLoadingOverlay;
