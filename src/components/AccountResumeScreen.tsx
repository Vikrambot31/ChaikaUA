import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import type { User } from '../types/app';

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    continueAs: 'Продовжити як',
    continue: 'Продовжити',
    switchAccount: 'Увійти під іншим акаунтом',
  },
  ru: {
    continueAs: 'Продолжить как',
    continue: 'Продолжить',
    switchAccount: 'Войти под другим аккаунтом',
  },
  en: {
    continueAs: 'Continue as',
    continue: 'Continue',
    switchAccount: 'Switch account',
  },
} as const;

type Props = {
  user: User;
  onContinue: () => void;
  onSwitch: () => void;
};

export default function AccountResumeScreen({ user, onContinue, onSwitch }: Props) {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const displayName = user.name?.trim() || null;
  const displayIdentifier = user.email?.trim() || user.phone?.trim() || null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <MaterialCommunityIcons name="account-circle-outline" size={56} color="#5F7B4D" />

        <Text style={styles.title}>{text.continueAs}</Text>

        {displayName ? (
          <Text style={styles.name}>{displayName}</Text>
        ) : null}

        {displayIdentifier ? (
          <Text style={styles.identifier}>{displayIdentifier}</Text>
        ) : null}

        <TouchableOpacity
          style={styles.continueBtn}
          onPress={onContinue}
          activeOpacity={0.82}
        >
          <Text style={styles.continueBtnText}>{text.continue}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchBtn}
          onPress={onSwitch}
          activeOpacity={0.82}
        >
          <Text style={styles.switchBtnText}>{text.switchAccount}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#8A7860',
  },
  name: {
    fontSize: 22,
    fontWeight: '900',
    color: '#3B2F1E',
    textAlign: 'center',
  },
  identifier: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A0896C',
    textAlign: 'center',
  },
  continueBtn: {
    marginTop: 14,
    width: '100%',
    backgroundColor: '#5F7B4D',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  switchBtn: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D4C5A9',
  },
  switchBtnText: {
    color: '#8A7860',
    fontSize: 14,
    fontWeight: '800',
  },
});
