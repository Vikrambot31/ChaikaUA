import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { setOsbbBuilding, type OsbbRole } from '../redux/slices/osbbSlice';
import { ref, set } from 'firebase/database';
import { database } from '../firebase-config';
import { selectUser } from '../redux/selectors';
import { getBuildingsByStreet, getStreets } from '../data/buildings';
import { SCREEN_THEME } from '../utils/screenTheme';

interface Props {
  onDone?: () => void;
}

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Вхід у розділ ОСББ',
    subtitle: 'Оберіть будинок, квартиру та роль. Мешканець одразу отримує доступ. Представник правління надсилає дані на підтвердження.',
    street: 'Вулиця',
    selectStreet: 'Оберіть вулицю',
    house: 'Будинок',
    selectHouse: 'Оберіть будинок',
    selectStreetFirst: 'Спочатку оберіть вулицю',
    apartment: 'Квартира',
    apartmentPlaceholder: 'Номер квартири',
    whoAreYou: 'Хто ви?',
    residentTitle: 'Звичайний мешканець ЖК',
    residentText: 'Одразу відкрити повний доступ до розділу',
    managerTitle: 'Представник правління ОСББ',
    managerText: 'Доступ є, статус потребує перевірки',
    managerData: 'Дані для модератора',
    managerName: 'ПІБ представника',
    managerPhone: 'Телефон для підтвердження',
    enterOsbb: 'Увійти в ОСББ',
    housePrefix: 'Будинок',
  },
  ru: {
    title: 'Вход в раздел ОСББ',
    subtitle: 'Выберите дом, квартиру и роль. Житель сразу получает доступ. Представитель правления отправляет данные на подтверждение.',
    street: 'Улица',
    selectStreet: 'Выберите улицу',
    house: 'Дом',
    selectHouse: 'Выберите дом',
    selectStreetFirst: 'Сначала выберите улицу',
    apartment: 'Квартира',
    apartmentPlaceholder: 'Номер квартиры',
    whoAreYou: 'Кто вы?',
    residentTitle: 'Обычный житель ЖК',
    residentText: 'Сразу открыть полный доступ к разделу',
    managerTitle: 'Представитель правления ОСББ',
    managerText: 'Доступ есть, статус требует проверки',
    managerData: 'Данные для модератора',
    managerName: 'ФИО представителя',
    managerPhone: 'Телефон для подтверждения',
    enterOsbb: 'Войти в ОСББ',
    housePrefix: 'Дом',
  },
  en: {
    title: 'Enter OSBB Section',
    subtitle: 'Select building, apartment and role. Residents get instant access. Board representatives submit data for verification.',
    street: 'Street',
    selectStreet: 'Select street',
    house: 'Building',
    selectHouse: 'Select building',
    selectStreetFirst: 'Select street first',
    apartment: 'Apartment',
    apartmentPlaceholder: 'Apartment number',
    whoAreYou: 'Who are you?',
    residentTitle: 'Regular resident',
    residentText: 'Open full section access immediately',
    managerTitle: 'OSBB board representative',
    managerText: 'Access is available, status needs review',
    managerData: 'Data for moderator',
    managerName: 'Representative full name',
    managerPhone: 'Phone for verification',
    enterOsbb: 'Enter OSBB',
    housePrefix: 'Building',
  },
} as const;

const OsbbSetupScreen: React.FC<Props> = ({ onDone }) => {
  const dispatch = useDispatch();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const [selectedStreet, setSelectedStreet] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedHouseNumber, setSelectedHouseNumber] = useState<string | null>(null);
  const [apartment, setApartment] = useState('');
  const [role, setRole] = useState<OsbbRole>('resident');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [streetExpanded, setStreetExpanded] = useState(false);
  const [buildingExpanded, setBuildingExpanded] = useState(false);
  const user = useSelector(selectUser);

  const streets = getStreets();
  const buildings = selectedStreet ? getBuildingsByStreet(selectedStreet) : [];
  const isManager = role === 'osbb_manager';
  const isConfirmEnabled =
    Boolean(selectedBuildingId && selectedStreet && selectedHouseNumber && apartment.trim()) &&
    (!isManager || Boolean(managerName.trim() && managerPhone.trim()));

  const handleSelectStreet = (street: string) => {
    setSelectedStreet(street);
    setSelectedBuildingId(null);
    setSelectedHouseNumber(null);
    setStreetExpanded(false);
    setBuildingExpanded(false);
  };

  const handleConfirm = async () => {
    if (!selectedBuildingId || !selectedStreet || !selectedHouseNumber || !isConfirmEnabled) return;
    if (user?.id) {
      await set(ref(database, `osbb_members/${selectedBuildingId}/${user.id}`), {
        uid: user.id,
        buildingId: selectedBuildingId,
        apartment: apartment.trim(),
        role: isManager ? 'manager' : 'resident',
        status: isManager ? 'pending' : 'approved',
        managerName: isManager ? managerName.trim() : null,
        managerPhone: isManager ? managerPhone.trim() : null,
        updatedAt: new Date().toISOString(),
      });
    }
    dispatch(
      setOsbbBuilding({
        buildingId: selectedBuildingId,
        street: selectedStreet,
        houseNumber: selectedHouseNumber,
        apartment: apartment.trim(),
        role,
        managerName: isManager ? managerName.trim() : undefined,
        managerPhone: isManager ? managerPhone.trim() : undefined,
      })
    );
    onDone?.();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Image source={require('../../assets/OSBB.png')} style={styles.headerImage} resizeMode="cover" />
            <View style={styles.headerBody}>
              <Text style={styles.title}>{text.title}</Text>
              <Text style={styles.subtitle}>{text.subtitle}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{text.street}</Text>
            <TouchableOpacity style={styles.select} onPress={() => setStreetExpanded((v) => !v)} activeOpacity={0.85}>
              <Text style={[styles.selectText, selectedStreet ? styles.selectTextActive : null]}>{selectedStreet ?? text.selectStreet}</Text>
              <MaterialCommunityIcons name={streetExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
            {streetExpanded ? (
              <View style={styles.options}>
                {streets.map((street) => (
                  <TouchableOpacity key={street} style={styles.option} onPress={() => handleSelectStreet(street)} activeOpacity={0.78}>
                    <Text style={styles.optionText}>{street}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{text.house}</Text>
            <TouchableOpacity
              style={[styles.select, !selectedStreet && styles.disabled]}
              onPress={() => selectedStreet && setBuildingExpanded((v) => !v)}
              activeOpacity={selectedStreet ? 0.85 : 1}
            >
              <Text style={[styles.selectText, selectedHouseNumber ? styles.selectTextActive : null]}>
                {selectedHouseNumber ? `${text.housePrefix} ${selectedHouseNumber}` : selectedStreet ? text.selectHouse : text.selectStreetFirst}
              </Text>
              <MaterialCommunityIcons name={buildingExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
            {buildingExpanded ? (
              <View style={styles.options}>
                {buildings.map((building) => (
                  <TouchableOpacity
                    key={building.id}
                    style={styles.option}
                    onPress={() => {
                      setSelectedBuildingId(building.id);
                      setSelectedHouseNumber(building.houseNumber);
                      setBuildingExpanded(false);
                    }}
                    activeOpacity={0.78}
                  >
                    <Text style={styles.optionText}>{text.housePrefix} {building.houseNumber}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{text.apartment}</Text>
            <TextInput
              style={styles.input}
              value={apartment}
              onChangeText={setApartment}
              placeholder={text.apartmentPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              keyboardType="numeric"
              maxLength={5}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{text.whoAreYou}</Text>
            <View style={styles.roleGrid}>
              <TouchableOpacity
                style={[styles.roleCard, role === 'resident' && styles.roleCardActive]}
                onPress={() => setRole('resident')}
                activeOpacity={0.85}
              >
                <Text style={styles.roleTitle}>{text.residentTitle}</Text>
                <Text style={styles.roleText}>{text.residentText}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleCard, role === 'osbb_manager' && styles.roleCardActive]}
                onPress={() => setRole('osbb_manager')}
                activeOpacity={0.85}
              >
                <Text style={styles.roleTitle}>{text.managerTitle}</Text>
                <Text style={styles.roleText}>{text.managerText}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isManager ? (
            <View style={styles.card}>
              <Text style={styles.label}>{text.managerData}</Text>
              <TextInput
                style={styles.input}
                value={managerName}
                onChangeText={setManagerName}
                placeholder={text.managerName}
                placeholderTextColor={SCREEN_THEME.textMuted}
              />
              <TextInput
                style={[styles.input, styles.inputGap]}
                value={managerPhone}
                onChangeText={setManagerPhone}
                placeholder={text.managerPhone}
                placeholderTextColor={SCREEN_THEME.textMuted}
                keyboardType="phone-pad"
              />
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.confirm, !isConfirmEnabled && styles.confirmDisabled]}
            onPress={handleConfirm}
            disabled={!isConfirmEnabled}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmText}>{text.enterOsbb}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 42 },
  header: {
    backgroundColor: '#3A352F',
    borderRadius: 0,
    overflow: 'hidden',
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 14,
    ...SCREEN_THEME.raisedShadowStrong,
  },
  headerImage: { width: '100%', height: 190 },
  headerBody: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 14,
    marginBottom: 12,
    ...SCREEN_THEME.raisedShadow,
  },
  label: { fontSize: 13, color: SCREEN_THEME.textSecondary, fontWeight: '900', marginBottom: 9, textTransform: 'uppercase' },
  select: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.cardCream,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  disabled: { opacity: 0.55 },
  selectText: { flex: 1, color: SCREEN_THEME.textMuted, fontWeight: '700' },
  selectTextActive: { color: SCREEN_THEME.textPrimary, fontWeight: '900' },
  options: { marginTop: 8, gap: 5 },
  option: { borderRadius: 12, backgroundColor: SCREEN_THEME.appBgSoft, paddingHorizontal: 12, paddingVertical: 11 },
  optionText: { color: SCREEN_THEME.textPrimary, fontWeight: '800' },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.cardCream,
    paddingHorizontal: 13,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '800',
  },
  inputGap: { marginTop: 10 },
  roleGrid: { gap: 10 },
  roleCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.cardCream,
    padding: 13,
  },
  roleCardActive: { borderColor: SCREEN_THEME.enamelBlue, backgroundColor: SCREEN_THEME.enamelBlue + '18' },
  roleTitle: { color: SCREEN_THEME.textPrimary, fontWeight: '900', fontSize: 15 },
  roleText: { color: SCREEN_THEME.textSecondary, fontWeight: '600', fontSize: 13, marginTop: 5, lineHeight: 18 },
  confirm: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.enamelBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    ...SCREEN_THEME.raisedShadow,
  },
  confirmDisabled: { backgroundColor: SCREEN_THEME.textMuted },
  confirmText: { color: '#fff', fontSize: 17, fontWeight: '900' },
});

export default OsbbSetupScreen;

