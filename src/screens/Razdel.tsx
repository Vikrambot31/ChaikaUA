import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { COLORS, SIZES } from '../utils/constants';
import MiniTabBar from '../components/MiniTabBar';
import { RootState } from '../redux/store';

const UI_TEXT = {
  ua: {
    defaultTitle: 'Розділ',
    defaultDesc: 'Детальна інформація',
    contentPrefix: 'Вміст розділу',
    elements: 'елементів',
  },
  ru: {
    defaultTitle: 'Раздел',
    defaultDesc: 'Детальная информация',
    contentPrefix: 'Содержимое раздела',
    elements: 'элементов',
  },
  en: {
    defaultTitle: 'Section',
    defaultDesc: 'Detailed information',
    contentPrefix: 'Section content',
    elements: 'items',
  },
} as const;

const Razdel: React.FC<{ title?: string; desc?: string; items?: unknown[] }> = ({
  title,
  desc,
  items = [],
}) => {
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];

  return (
    <SafeAreaView style={styles.c}>
      <ScrollView contentContainerStyle={styles.s}>
        <View style={styles.h}>
          <MaterialCommunityIcons name="information" size={42} color="#FFF" />
          <Text style={styles.t}>{title || text.defaultTitle}</Text>
          <Text style={styles.st}>{desc || text.defaultDesc}</Text>
        </View>
        <View style={styles.c2}>
          <Text style={styles.txt}>{text.contentPrefix}: {items.length} {text.elements}</Text>
        </View>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#F7F3EE' },
  s: { padding: 16, paddingTop: 24, paddingBottom: 32 },
  h: { backgroundColor: '#7A1E5C', borderRadius: 20, padding: 18, marginBottom: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  t: { fontSize: 28, fontWeight: '900', color: '#FFF', marginTop: 8, letterSpacing: 0.8 },
  st: { marginTop: 6, color: 'rgba(255,255,255,0.88)', fontSize: SIZES.fontSmall, textAlign: 'center' },
  c2: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  txt: { fontSize: SIZES.fontRegular, color: COLORS.gray, fontWeight: '700' },
});

export default Razdel;

