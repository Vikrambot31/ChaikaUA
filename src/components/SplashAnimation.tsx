import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { SCREEN_W as width, SCREEN_H as height } from '../utils/webDimensions';

interface Props {
  onFinish?: () => void;
}

const SplashAnimation: React.FC<Props> = ({ onFinish }) => {
  const [videoVisible, setVideoVisible] = useState(true);
  const calledRef = useRef(false);

  const handleFinish = () => {
    if (calledRef.current) return;
    calledRef.current = true;
    setVideoVisible(false);
    onFinish?.();
  };

  useEffect(() => {
    const timer = setTimeout(handleFinish, 8000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {videoVisible && (
        <Video
          source={require('../../assets/video-Logo2.mp4')}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping={false}
          isMuted
          useNativeControls={false}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.didJustFinish) {
              handleFinish();
            }
          }}
        />
      )}
      {videoVisible ? (
        <TouchableOpacity style={styles.skipButton} activeOpacity={0.85} onPress={handleFinish}>
          <Text style={styles.skipButtonText}>Пропустить</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width,
    height,
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 18,
    backgroundColor: 'rgba(16, 28, 38, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(246, 232, 196, 0.35)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  skipButtonText: {
    color: '#F6E8C4',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default SplashAnimation;
