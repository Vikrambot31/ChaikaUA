import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const OPERATORS = [
  {
    name: 'Kyivstar',
    color: '#0066CC',
    bg: '#EFF5FF',
    codes: ['39', '67', '68', '77', '96', '97', '98'],
  },
  {
    name: 'Vodafone',
    color: '#CC0000',
    bg: '#FFF0F0',
    codes: ['50', '66', '75', '95', '99'],
  },
  {
    name: 'lifecell',
    color: '#CC5500',
    bg: '#FFF4EC',
    codes: ['63', '73', '93'],
  },
  {
    name: 'TriMob',
    color: '#2255AA',
    bg: '#EEF2FA',
    codes: ['91'],
  },
  {
    name: 'PEOPLEnet',
    color: '#6633AA',
    bg: '#F5F0FA',
    codes: ['92'],
  },
  {
    name: 'Intertelecom',
    color: '#1A7A3A',
    bg: '#EEFAF2',
    codes: ['89', '94', '20'],
  },
] as const;

const TITLE: Record<string, string> = {
  ua: 'Виберіть оператора',
  ru: 'Выберите оператора',
  en: 'Select operator',
};

const HINT: Record<string, string> = {
  ua: 'Підказка для швидкого старту',
  ru: 'Подсказка для быстрого набора',
  en: 'Quick-start hint',
};

interface Props {
  onSelect: (prefix: string) => void;
  language?: 'ua' | 'ru' | 'en';
}

export function PhonePrefixHelper({ onSelect, language = 'ua' }: Props) {
  const [visible, setVisible] = useState(false);

  const handleSelect = (code: string) => {
    onSelect(`+380${code}`);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={styles.triggerFlag}>🇺🇦</Text>
        <Text style={styles.triggerText}>+380 •</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{TITLE[language]}</Text>
              <Text style={styles.sheetHint}>{HINT[language]}</Text>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {OPERATORS.map((op) => (
                <View key={op.name} style={[styles.operatorBlock, { backgroundColor: op.bg }]}>
                  <Text style={[styles.operatorName, { color: op.color }]}>{op.name}</Text>
                  <View style={styles.prefixRow}>
                    {op.codes.map((code) => (
                      <TouchableOpacity
                        key={code}
                        style={[styles.prefixChip, { borderColor: op.color }]}
                        onPress={() => handleSelect(code)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.prefixText, { color: op.color }]}>
                          +380 {code}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F0EBE0',
    borderWidth: 1,
    borderColor: '#DDD0B8',
    marginBottom: 6,
  },
  triggerFlag: {
    fontSize: 14,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5A4A3A',
    letterSpacing: 0.3,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFDF6',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#D4C4A8',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE0C8',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#3A2E22',
  },
  sheetHint: {
    fontSize: 12,
    color: '#9A8878',
    marginTop: 2,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  operatorBlock: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  operatorName: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  prefixRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  prefixChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: '#FFFDF6',
  },
  prefixText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

