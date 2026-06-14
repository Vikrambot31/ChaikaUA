import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import Svg, { Circle } from 'react-native-svg';
import { SCREEN_W } from '../utils/webDimensions';

interface VideoLoadingOverlayProps {
  visible: boolean;
  /** Delay before showing (ms). If loading ends before this, overlay never appears. Default: 300 */
  showDelay?: number;
  /** Minimum time to stay visible once shown (ms). Prevents flash. Default: 1500 */
  minDuration?: number;
}

const CIRCLE_SIZE = SCREEN_W * 0.55;
const FADE_DURATION = 250;
const SNAKE_BORDER = 5;
const SVG_PAD = 6; // extra space so the stroke doesn't clip
const SVG_SIZE = CIRCLE_SIZE + (SNAKE_BORDER + SVG_PAD) * 2;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const RING_R = CIRCLE_SIZE / 2 + SVG_PAD;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;
const SNAKE_ARC = CIRCUMFERENCE * 0.28; // 28% arc length

export const VideoLoadingOverlay: React.FC<VideoLoadingOverlayProps> = ({
  visible,
  showDelay = 300,
  minDuration = 1500,
}) => {
  const [shouldRender, setShouldRender] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const shownAtRef = useRef<number | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      showTimerRef.current = setTimeout(() => {
        fadeIn();
      }, showDelay);
    } else {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
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

  // Spinning snake animation
  useEffect(() => {
    if (!shouldRender) return;
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1100,
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

        {/* Video circle + rotating snake border */}
        <View style={styles.videoWrapper}>
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

          {/* Snake arc rotating around the circle */}
          <Animated.View
            style={[styles.snakeWrapper, { transform: [{ rotate: spinInterpolation }] }]}
            pointerEvents="none"
          >
            <Svg width={SVG_SIZE} height={SVG_SIZE}>
              <Circle
                cx={CX}
                cy={CY}
                r={RING_R}
                stroke="#7d0e59"
                strokeWidth={SNAKE_BORDER}
                strokeDasharray={`${SNAKE_ARC} ${CIRCUMFERENCE - SNAKE_ARC}`}
                strokeLinecap="round"
                fill="none"
                rotation={-90}
                origin={`${CX}, ${CY}`}
              />
            </Svg>
          </Animated.View>
        </View>

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
  videoWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: SVG_SIZE,
    height: SVG_SIZE,
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
  snakeWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default VideoLoadingOverlay;
