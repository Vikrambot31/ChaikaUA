import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { NavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { auth } from '../firebase-config';
import { isAnonymousFirebaseUser } from '../firebase-auth-session';
import { clearError } from '../redux/slices/authSlice';
import { selectAuthError, selectAuthLoading, selectUser } from '../redux/selectors';
import { BUILDINGS, getBuildingsByStreet, getStreets } from '../data/buildings';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileCard from '../components/TactileCard';
import TactileInput from '../components/TactileInput';
import TactileButton from '../components/TactileButton';
import FormSectionLabel from '../components/FormSectionLabel';
import { normalizeEmailText, normalizePersonName, normalizePhoneText } from '../utils/textUtils';
import { validateEmail, validateName, validatePassword, validatePhone } from '../utils/validators';
import { RootState } from '../redux/store';
import { QuickRegistrationParams, useFullRegistration } from '../hooks/useFullRegistration';
import { getRegistrationFullText } from './registrationFullText';

const REGISTRATION_DRAFT_KEY = '@chaika:full-registration-draft:v1';
const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 120;
const MAX_PHONE_LENGTH = 20;
const MAX_PASSWORD_LENGTH = 128;

const RegisterScreenFull: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<import('@react-navigation/native').RouteProp<Record<string, QuickRegistrationParams | undefined>, string>>();
  const dispatch = useDispatch();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const loading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);
  const currentUser = useSelector(selectUser);
  const prefilledParams = (route.params ?? {}) as QuickRegistrationParams;
  const isCompletingExistingAccount = Boolean(auth.currentUser && !isAnonymousFirebaseUser(auth.currentUser) && currentUser?.registrationStatus === 'partial');

  const text = useMemo(() => getRegistrationFullText(language), [language]);

  const [name, setName] = useState(() => normalizePersonName(prefilledParams.name || currentUser?.name || auth.currentUser?.displayName || ''));
  const [email, setEmail] = useState(() => normalizeEmailText(prefilledParams.email || currentUser?.email || auth.currentUser?.email || ''));
  const [phone, setPhone] = useState(() => normalizePhoneText(prefilledParams.phone || currentUser?.phone || auth.currentUser?.phoneNumber || ''));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedStreet, setSelectedStreet] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [referrerPhone, setReferrerPhone] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const loadDraft = async () => {
      try {
        const raw = await AsyncStorage.getItem(REGISTRATION_DRAFT_KEY);
        if (!raw || !active) {
          return;
        }

        const draft = JSON.parse(raw) as {
          name?: string;
          email?: string;
          phone?: string;
          selectedStreet?: string;
          selectedBuildingId?: string;
          referrerPhone?: string;
          agreeTerms?: boolean;
        };

        if (typeof draft.name === 'string') setName(normalizePersonName(draft.name));
        if (typeof draft.email === 'string') setEmail(normalizeEmailText(draft.email));
        if (typeof draft.phone === 'string') setPhone(normalizePhoneText(draft.phone));
        if (typeof draft.selectedStreet === 'string') setSelectedStreet(draft.selectedStreet);
        if (typeof draft.selectedBuildingId === 'string') setSelectedBuildingId(draft.selectedBuildingId);
        if (typeof draft.referrerPhone === 'string') setReferrerPhone(normalizePhoneText(draft.referrerPhone));
        if (typeof draft.agreeTerms === 'boolean') setAgreeTerms(draft.agreeTerms);
      } catch {
        await AsyncStorage.removeItem(REGISTRATION_DRAFT_KEY);
      } finally {
        if (active) {
          setDraftLoaded(true);
        }
      }
    };

    void loadDraft();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return undefined;
    }

    const saveTimer = setTimeout(() => {
      void AsyncStorage.setItem(
        REGISTRATION_DRAFT_KEY,
        JSON.stringify({
          name,
          email,
          phone,
          selectedStreet,
          selectedBuildingId,
          referrerPhone,
          agreeTerms,
        })
      );
    }, 500);

    return () => clearTimeout(saveTimer);
  }, [agreeTerms, draftLoaded, email, name, phone, referrerPhone, selectedBuildingId, selectedStreet]);

  const streets = useMemo(() => getStreets(), []);
  const buildingsInStreet = useMemo(
    () => (selectedStreet ? getBuildingsByStreet(selectedStreet) : []),
    [selectedStreet]
  );
  const selectedBuilding = useMemo(
    () => BUILDINGS.find((b) => b.id === selectedBuildingId),
    [selectedBuildingId]
  );

  const normalizedName = useMemo(() => normalizePersonName(name), [name]);
  const normalizedEmail = useMemo(() => normalizeEmailText(email), [email]);
  const normalizedPhone = useMemo(() => normalizePhoneText(phone), [phone]);
  const isNameValid = validateName(normalizedName);
  const isEmailValid = validateEmail(normalizedEmail);
  const isPhoneValid = validatePhone(normalizedPhone);
  const isPasswordValid = isCompletingExistingAccount ? true : validatePassword(password);
  const isPasswordsMatch = isCompletingExistingAccount ? true : password === confirmPassword;
  const isAddressValid = Boolean(selectedStreet && selectedBuildingId);
  const isGuarantorComplete = referrerPhone.trim().length === 0 || validatePhone(normalizePhoneText(referrerPhone));
  const isFormValid =
    isNameValid &&
    isEmailValid &&
    isPhoneValid &&
    isPasswordValid &&
    isPasswordsMatch &&
    isAddressValid &&
    isGuarantorComplete &&
    agreeTerms;

  const { handleRegister } = useFullRegistration({
    currentProvider: currentUser?.provider,
    draftKey: REGISTRATION_DRAFT_KEY,
    isCompletingExistingAccount,
    isFormValid,
    navigation,
    normalizedEmail,
    normalizedName,
    normalizedPhone,
    password,
    referrerPhone,
    routeParams: route.params,
    selectedBuilding,
    text,
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TactileCard elevated style={styles.headerCard} pressable={false}>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
          <View style={styles.modeSwitchRow}>
            <TouchableOpacity style={styles.modeSwitchButtonSecondary} onPress={() => navigation.navigate('LoginScreen')} disabled={loading} activeOpacity={0.8}>
              <Text style={styles.modeSwitchButtonTextSecondary}>{text.quickReg}</Text>
              <Text style={styles.modeSwitchHint}>Google / Facebook</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeSwitchButtonPrimary} disabled activeOpacity={0.8}>
              <Text style={styles.modeSwitchButtonTextPrimary}>{text.title}</Text>
              <Text style={styles.modeSwitchHintLight}>{text.addressData}</Text>
            </TouchableOpacity>
          </View>
        </TactileCard>

        <TactileCard elevated style={styles.formCard} pressable={false}>
          <FormSectionLabel label={text.personal} completed={isNameValid && isEmailValid && isPhoneValid && isPasswordValid && isPasswordsMatch} labelStyle={styles.sectionTitle} containerStyle={styles.sectionRow} />

          <FormSectionLabel label={text.fullName} completed={isNameValid} labelStyle={styles.label} containerStyle={styles.labelRow} />
          <TactileInput
            placeholder={text.enterName}
            value={name}
            onChangeText={(text) => {
              setName(normalizePersonName(text));
              if (error) dispatch(clearError());
            }}
            editable={!loading}
            maxLength={MAX_NAME_LENGTH}
          />

          <FormSectionLabel label={text.email} completed={isEmailValid} labelStyle={styles.label} containerStyle={styles.labelRow} />
          <TactileInput
            placeholder={text.email}
            value={email}
            onChangeText={(text) => {
              setEmail(normalizeEmailText(text));
              if (error) dispatch(clearError());
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading && !isCompletingExistingAccount}
            maxLength={MAX_EMAIL_LENGTH}
          />

          <FormSectionLabel label={text.phone} completed={isPhoneValid} labelStyle={styles.label} containerStyle={styles.labelRow} />
          <TactileInput
            placeholder="+380..."
            value={phone}
            onChangeText={(text) => {
              setPhone(normalizePhoneText(text));
              if (error) dispatch(clearError());
            }}
            keyboardType="phone-pad"
            editable={!loading}
            maxLength={MAX_PHONE_LENGTH}
          />

          {!isCompletingExistingAccount ? (
            <>
              <FormSectionLabel label={text.password} completed={isPasswordValid} labelStyle={styles.label} containerStyle={styles.labelRow} />
              <View style={styles.passwordWrap}>
                <TactileInput
                  placeholder={text.minPassword}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <TouchableOpacity onPress={() => setShowPassword((value) => !value)} disabled={loading}>
                  <Text style={styles.toggleText}>{showPassword ? text.hide : text.show}</Text>
                </TouchableOpacity>
              </View>

              <FormSectionLabel label={text.confirmPassword} completed={isPasswordsMatch && confirmPassword.length > 0} labelStyle={styles.label} containerStyle={styles.labelRow} />
              <View style={styles.passwordWrap}>
                <TactileInput
                  placeholder={text.repeatPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  editable={!loading}
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword((value) => !value)} disabled={loading}>
                  <Text style={styles.toggleText}>{showConfirmPassword ? text.hide : text.show}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <FormSectionLabel label={text.address} completed={isAddressValid} labelStyle={styles.sectionTitle} containerStyle={styles.sectionRow} />

          <FormSectionLabel label={text.street} completed={Boolean(selectedStreet)} labelStyle={styles.label} containerStyle={styles.labelRow} />
          <View style={styles.pickerContainer}>
            <Picker
              style={styles.picker}
              selectedValue={selectedStreet}
              onValueChange={(value) => {
                setSelectedStreet(value);
                setSelectedBuildingId('');
              }}
            >
              <Picker.Item label={text.streetPick} value="" />
              {streets.map((street) => (
                <Picker.Item key={street} label={street} value={street} />
              ))}
            </Picker>
          </View>

          {selectedStreet ? (
            <>
              <FormSectionLabel label={text.house} completed={Boolean(selectedBuildingId)} labelStyle={styles.label} containerStyle={styles.labelRow} />
              <View style={styles.pickerContainer}>
                  <Picker
                    style={styles.picker}
                    selectedValue={selectedBuildingId}
                    onValueChange={(value) => {
                      setSelectedBuildingId(value);
                    }}
                  >
                  <Picker.Item label={text.housePick} value="" />
                  {buildingsInStreet.map((building) => (
                    <Picker.Item key={building.id} label={`${text.house} ${building.houseNumber}`} value={building.id} />
                  ))}
                </Picker>
              </View>
            </>
          ) : null}

          <FormSectionLabel label={text.guarantor} completed={isGuarantorComplete} labelStyle={styles.sectionTitle} containerStyle={styles.sectionRow} />
          <FormSectionLabel label={text.guarantorPhone} completed={isGuarantorComplete} labelStyle={styles.label} containerStyle={styles.labelRow} />
          <TactileInput
            placeholder={text.optionalPhone}
            value={referrerPhone}
            onChangeText={(text) => setReferrerPhone(normalizePhoneText(text))}
            keyboardType="phone-pad"
            editable={!loading}
            maxLength={MAX_PHONE_LENGTH}
          />

          <TouchableOpacity style={styles.termsContainer} onPress={() => setAgreeTerms((value) => !value)} disabled={loading} activeOpacity={0.7}>
            <View style={[styles.checkbox, agreeTerms && styles.checkboxActive]} />
            <Text style={styles.termsText}>{text.agree}</Text>
            {agreeTerms ? <View style={styles.termsCheckDot} /> : null}
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.btnSpacing}>
            <TactileButton
              title={text.register}
              onPress={handleRegister}
              disabled={!isFormValid || loading}
              loading={loading}
              variant="primary"
            />
          </View>
        </TactileCard>

        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>{text.haveAccount}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('LoginScreen')} disabled={loading}>
            <Text style={styles.loginLink}>{text.login}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingTop: 24, paddingBottom: 32 },
  headerCard: { padding: 18, marginBottom: 20, alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 8, textAlign: 'center', alignSelf: 'stretch' },
  headerSubtitle: { marginTop: 6, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  modeSwitchRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modeSwitchButtonSecondary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2D6CA',
    backgroundColor: '#FFF8F1',
    alignItems: 'center',
  },
  modeSwitchButtonPrimary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
  },
  modeSwitchButtonTextSecondary: { fontSize: 13, fontWeight: '900', color: SCREEN_THEME.textPrimary, textAlign: 'center' },
  modeSwitchButtonTextPrimary: { fontSize: 13, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  modeSwitchHint: { marginTop: 4, fontSize: 11, color: SCREEN_THEME.textSecondary, textAlign: 'center', fontWeight: '600' },
  modeSwitchHintLight: { marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.88)', textAlign: 'center', fontWeight: '600' },
  formCard: { padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 8, marginBottom: 10 },
  sectionRow: { marginTop: 8, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: SCREEN_THEME.textPrimary, marginBottom: 6, marginTop: 4 },
  labelRow: { marginBottom: 6, marginTop: 4 },
  passwordWrap: { gap: 6 },
  toggleText: { color: SCREEN_THEME.terracottaDark, fontWeight: '700', marginTop: 4 },
  pickerContainer: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    overflow: 'hidden',
    marginBottom: 10,
  },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  termsContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E8DDD3',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: { backgroundColor: SCREEN_THEME.terracotta, borderColor: SCREEN_THEME.terracotta },
  termsText: { flex: 1, fontSize: 13, color: SCREEN_THEME.textPrimary, fontWeight: '600', lineHeight: 18 },
  termsCheckDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#2EB85C' },
  errorText: { fontSize: 12, color: '#D05B4D', marginBottom: 8, fontWeight: '700' },
  btnSpacing: { marginTop: 10 },
  loginContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loginText: { fontSize: 14, color: SCREEN_THEME.textSecondary, fontWeight: '600' },
  loginLink: { fontSize: 14, color: SCREEN_THEME.terracottaDark, fontWeight: '800' },
});

export default RegisterScreenFull;
