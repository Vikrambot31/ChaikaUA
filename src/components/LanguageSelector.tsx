import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useDispatch } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { setLanguage } from '../redux/slices/languageSlice';
import { useTranslation } from '../i18n/useTranslation';
import { Language } from '../i18n/translations';

const LanguageSelector: React.FC = () => {
  const dispatch = useDispatch();
  const { t, language } = useTranslation();

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ua', label: 'UA', flag: '🇺🇦' },
    { code: 'ru', label: 'РУ', flag: '' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];

  const handleLanguageChange = (lang: Language) => {
    dispatch(setLanguage(lang));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t.common.language}</Text>
      <View style={styles.languageList}>
        {languages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.languageItem,
              language === lang.code && styles.languageItemActive,
            ]}
            onPress={() => handleLanguageChange(lang.code)}
            activeOpacity={0.7}
          >
            {lang.code === 'ru' ? (
              <Image source={require('../../assets/WEBP-version/Russia No war.webp')} style={styles.noWarIcon} resizeMode="contain" />
            ) : (
              <Text style={styles.flag}>{lang.flag}</Text>
            )}
            <Text
              style={[
                styles.languageLabel,
                language === lang.code && styles.languageLabelActive,
              ]}
            >
              {lang.label}
            </Text>
            {language === lang.code && (
              <MaterialCommunityIcons name="check-circle" size={24} color="#7A1E5C" />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  languageList: {
    gap: 8,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E8DDD3',
    backgroundColor: '#F7F3EE',
  },
  languageItemActive: {
    borderColor: '#7A1E5C',
    backgroundColor: '#FFF5F8',
  },
  flag: {
    fontSize: 24,
    marginRight: 12,
  },
  noWarIcon: {
    width: 24,
    height: 16,
    marginRight: 12,
    borderRadius: 3,
  },
  languageLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  languageLabelActive: {
    color: '#7A1E5C',
    fontWeight: '700',
  },
});

export default LanguageSelector;

