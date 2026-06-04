import React, { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { SCREEN_THEME } from '../utils/screenTheme';

const { width, height } = Dimensions.get('window');
const isCompactHeight = height < 720;
const captionFontSize = isCompactHeight ? 16 : 18;
const captionLineHeight = isCompactHeight ? 21 : 24;
const imageCardHeight = height * (isCompactHeight ? 0.58 : 0.62);

type Slide = {
  key: string;
  image: number;
};

const SLIDES: Slide[] = [
  {
    key: 'intro-1',
    image: require('../../assets/WEBP-version/intro1.webp'),
  },
  {
    key: 'intro-2',
    image: require('../../assets/WEBP-version/intro2.webp'),
  },
  {
    key: 'intro-3',
    image: require('../../assets/WEBP-version/intro3.webp'),
  },
];

type FirstLaunchOnboardingProps = {
  onDone: () => void;
};

export default function FirstLaunchOnboarding({ onDone }: FirstLaunchOnboardingProps) {
  const language = useSelector((state: { language?: { current?: string } }) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const lastSlideIndex = SLIDES.length - 1;

  const captions = {
    ua: [
      'Дізнавайся, де на Чайці найкраща кава, піца та затишні місця',
      'Проси допомогу швидко, коли щось терміново потрібно',
      'Знаходь людей поруч для спілкування, зустрічей і нових знайомств',
    ],
    ru: [
      'Узнавай, где на Чайке лучший кофе, пицца и уютные места',
      'Проси помощь быстро, когда срочно что-то нужно',
      'Находи людей рядом для общения, встреч и новых знакомств',
    ],
    en: [
      'Discover the best coffee, pizza and cozy places in Chaika Life',
      'Ask for help quickly when you urgently need something',
      'Find nearby people for chats, meetings and new знакомства',
    ],
  } as const;

  const uiText = {
    ua: { openApp: 'Відкрити застосунок', next: 'Далі', skip: 'Пропустити' },
    ru: { openApp: 'Открыть приложение', next: 'Далее', skip: 'Пропустить' },
    en: { openApp: 'Open app', next: 'Next', skip: 'Skip' },
  } as const;

  const text = uiText[language];

  const buttonLabel = useMemo(
    () => (index === lastSlideIndex ? text.openApp : text.next),
    [index, lastSlideIndex, text]
  );

  const handleNext = () => {
    if (index >= lastSlideIndex) {
      onDone();
      return;
    }

    const nextIndex = index + 1;
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
    setIndex(nextIndex);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={SCREEN_THEME.appBg} />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>ЧАЙКА</Text>
          </View>
          <TouchableOpacity onPress={onDone} activeOpacity={0.8}>
            <Text style={styles.skipText}>{text.skip}</Text>
          </TouchableOpacity>
        </View>

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
          {SLIDES.map((slide) => (
            <View key={slide.key} style={styles.slide}>
              <View style={styles.imageCard}>
                <Image source={slide.image} style={styles.image} resizeMode="contain" />
              </View>
              <View style={styles.captionChip}>
                <Text style={styles.captionText}>{captions[language][SLIDES.findIndex((item) => item.key === slide.key)]}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {SLIDES.map((slide, slideIndex) => (
              <View key={slide.key} style={[styles.dot, slideIndex === index && styles.dotActive]} />
            ))}
          </View>

          <TouchableOpacity style={styles.ctaButton} onPress={handleNext} activeOpacity={0.86}>
            <Text style={styles.ctaText}>{buttonLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  shell: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
    paddingTop: 4,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandBadge: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
  },
  brandBadgeText: {
    color: SCREEN_THEME.woodGreenDark,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  skipText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  slide: {
    width,
    paddingHorizontal: 8,
    paddingTop: 2,
  },
  imageCard: {
    height: imageCardHeight,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'transparent',
    zIndex: 10,
    marginBottom: 12,
  },
  image: {
    width: '100%',
    height: '100%',
    zIndex: 10,
  },
  captionChip: {
    marginHorizontal: 12,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: isCompactHeight ? 9 : 10,
    backgroundColor: 'rgba(255, 249, 238, 0.95)',
    zIndex: 20,
  },
  captionText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: captionFontSize,
    lineHeight: captionLineHeight,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D9C8A5',
  },
  dotActive: {
    width: 28,
    backgroundColor: SCREEN_THEME.terracotta,
  },
  ctaButton: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
    shadowColor: SCREEN_THEME.shadowDeep,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  ctaText: {
    color: '#FFF9EF',
    fontSize: 17,
    fontWeight: '900',
  },
});


