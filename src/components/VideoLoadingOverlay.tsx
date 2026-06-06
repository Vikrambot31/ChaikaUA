import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
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
  /** Delay before showing (ms). If loading ends before this, overlay never appears. Default: 300 */
  showDelay?: number;
  /** Minimum time to stay visible once shown (ms). Prevents flash. Default: 1500 */
  minDuration?: number;
}

const CIRCLE_SIZE = Dimensions.get('window').width * 0.55;
const FADE_DURATION = 250;

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
  showDelay = 300,
  minDuration = 1500,
}) => {
  // shouldRender: actual DOM presence (controls video playback)
  const [shouldRender, setShouldRender] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Timestamps for min-duration logic
  const shownAtRef = useRef<number | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phrase = useMemo(() => getRandomPhrase(), []); // one phrase per mount

  const fadeIn = useCallback(() => {
    setShouldRender(true);
    shownAtRef.current = Date.now();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: FADE_DURATION,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const fadeOut = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: FADE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShouldRender(false);
    });
  }, [fadeAnim]);

  useEffect(() => {
    if (visible) {
      // Cancel any pending hide
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Delay before showing — prevents flash on fast loads
      showTimerRef.current = setTimeout(() => {
        fadeIn();
      }, showDelay);
    } else {
      // Cancel pending show
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      // If already visible, respect min duration
      if (shownAtRef.current !== null) {
        const elapsed = Date.now() - shownAtRef.current;
        const remaining = minDuration - elapsed;
        if (remaining > 0) {
          hideTimerRef.current = setTimeout(() => {
            shownAtRef.current = null;
            fadeOut();
          }, remaining);
        } else {
          shownAtRef.current = null;
          fadeOut();
        }
      }
    }

    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [visible, showDelay, minDuration, fadeIn, fadeOut]);

  // Spinner animation — runs while rendered
  useEffect(() => {
    if (!shouldRender) return;
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
  }, [shouldRender, spinAnim]);

  if (!shouldRender) return null;

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        {/* Speech bubble */}
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
            shouldPlay
            isLooping
            isMuted
          />
        </View>

        {/* Loading text */}
        <Text style={styles.text}>{text}</Text>

        {/* Spinner */}
        <Animated.View style={[styles.spinner, { transform: [{ rotate: spinInterpolation }] }]}>
          <View style={styles.spinnerArc} />
        </Animated.View>
      </View>
    </Animated.View>
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
