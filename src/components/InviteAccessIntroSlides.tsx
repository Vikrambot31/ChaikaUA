import React, { useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { SCREEN_W as width } from '../utils/webDimensions';
import type { RootState } from '../redux/store';

type Lang = 'ua' | 'ru' | 'en';

const TEXT = {
  ua: { next: 'Далі', continue: 'Продовжити', hint: 'Гортайте вліво, щоб переглянути всі слайди' },
  ru: { next: 'Далее', continue: 'Продолжить', hint: 'Листайте влево, чтобы просмотреть все слайды' },
  en: { next: 'Next', continue: 'Continue', hint: 'Swipe left to see all slides' },
} as const;

type InviteAccessIntroSlidesProps = {
  onDone: () => void;
};

const SLIDES = [
  require('../../assets/Poruchitel3-1.png'),
  require('../../assets/Poruchitel3-2.png'),
  require('../../assets/Poruchitel3-3.png'),
];

export default function InviteAccessIntroSlides({ onDone }: InviteAccessIntroSlidesProps) {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const t = TEXT[language];
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;

  const buttonLabel = useMemo(() => (isLast ? t.continue : t.next), [isLast, t]);

  const handleNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    const nextIndex = index + 1;
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    setIndex(nextIndex);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setIndex(nextIndex);
          }}
        >
          {SLIDES.map((source, slideIndex) => (
            <View key={slideIndex} style={styles.slide}>
              <Image source={source} style={styles.slideImage} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {SLIDES.map((_, dotIndex) => (
              <View key={dotIndex} style={[styles.dot, dotIndex === index && styles.dotActive]} />
            ))}
          </View>
          <Text style={styles.hint}>{t.hint}</Text>
          <TouchableOpacity style={styles.button} onPress={handleNext} activeOpacity={0.9}>
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF3FB',
  },
  root: {
    flex: 1,
    backgroundColor: '#EEF3FB',
  },
  slide: {
    width,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  slideImage: {
    width: '100%',
    height: '78%',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#C9D4E2',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#175487',
  },
  hint: {
    textAlign: 'center',
    color: '#5C6F86',
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#175487',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
