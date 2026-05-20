import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { NavigationProp, useNavigation, useRoute } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { User as FirebaseUser, sendPasswordResetEmail, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setUser, setLoading, setError, clearError } from '../redux/slices/authSlice';
import { selectAuthLoading, selectAuthError } from '../redux/selectors';
import { auth, socialAuthAPI } from '../firebase-config';
import { firebaseApp } from '../firebase-core';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileCard from '../components/TactileCard';
import TactileInput from '../components/TactileInput';
import TactileButton from '../components/TactileButton';
import { FormFieldError } from '../components/ValidationErrorMessage';
import { normalizeEmailText } from '../utils/textUtils';
import { validateEmail } from '../utils/validators';
import { resolveAppUserFromFirebase } from '../services/authProfileService';

// RootState type for language selector
interface LangState { language?: { current?: string } }

const LOGIN_LOCK_KEY_PREFIX = 'chaika_login_lock_';
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

type LoginLockRecord = {
  attempts: number;
  lockedUntil: number;
};

type ServerSignInResponse = {
  customToken?: string;
};

const getLoginLockKey = (email: string) => `${LOGIN_LOCK_KEY_PREFIX}${email.toLowerCase()}`;

const readLoginLock = async (email: string): Promise<LoginLockRecord> => {
  const raw = await AsyncStorage.getItem(getLoginLockKey(email));
  if (!raw) return { attempts: 0, lockedUntil: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<LoginLockRecord>;
    return {
      attempts: Number(parsed.attempts) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
};

const clearLoginLock = async (email: string): Promise<void> => {
  await AsyncStorage.removeItem(getLoginLockKey(email));
};

const recordLoginFailure = async (email: string): Promise<LoginLockRecord> => {
  const current = await readLoginLock(email);
  const attempts = current.attempts + 1;
  const lockedUntil = attempts >= LOGIN_MAX_FAILED_ATTEMPTS ? Date.now() + LOGIN_LOCK_MS : 0;
  const next = { attempts, lockedUntil };
  await AsyncStorage.setItem(getLoginLockKey(email), JSON.stringify(next));
  return next;
};

const signInWithServerRateLimit = async (email: string, password: string) => {
  const functions = getFunctions(firebaseApp);
  const signIn = httpsCallable<{ email: string; password: string }, ServerSignInResponse>(
    functions,
    'signInWithEmailRateLimited',
  );
  const result = await signIn({ email, password });
  const customToken = result.data.customToken;
  if (!customToken) {
    throw new Error('Server sign-in did not return a custom token');
  }
  return signInWithCustomToken(auth, customToken);
};

const UI_TEXT = {
  ua: {
    subtitle: 'Вхід в акаунт',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Пароль',
    showPassword: 'Показати',
    hidePassword: 'Сховати',
    loginBtn: 'Увійти',
    googleBtn: 'Увійти через Google',
    facebookBtn: 'Увійти через Facebook',
    appleBtn: 'Увійти через Apple',
    noAccount: 'Немає акаунту? ',
    register: 'Зареєструватися',
    errorTitle: 'Помилка',
    errorFields: 'Заповніть поля коректно',
    errorLoginTitle: 'Помилка входу',
    errorLogin: 'Не вдалося увійти. Перевірте email та пароль.',
    googleLoginFailed: 'Не вдалося увійти через Google. Спробуйте ще раз.',
    facebookLoginFailed: 'Не вдалося увійти через Facebook. Спробуйте ще раз.',
    socialCanceled: 'Вхід скасовано користувачем.',
    socialInProgress: 'Вхід уже виконується. Зачекайте кілька секунд.',
    playServicesMissing: 'Google Play Services недоступний. Оновіть сервіси Google.',
    socialConfigError: 'Google/Facebook вхід не налаштовано для цієї збірки. Оновіть застосунок або зверніться до підтримки.',
    socialGeneric: 'Помилка соціального входу. Спробуйте ще раз пізніше.',
    appleLoginFailed: 'Не вдалося увійти через Apple. Спробуйте ще раз.',
    loginLocked: 'Забагато невдалих спроб. Спробуйте знову через 15 хвилин.',
    forgotPassword: 'Забули пароль?',
    resetPasswordSent: 'Інструкцію для скидання пароля надіслано на ваш email.',
    resetPasswordNeedEmail: 'Введіть коректний email, щоб скинути пароль.',
    resetPasswordFailed: 'Не вдалося надіслати лист для скидання пароля.',
    inlineEmailError: 'Введіть коректний email.',
    inlinePasswordError: 'Пароль має містити щонайменше 6 символів.',
  },
  ru: {
    subtitle: 'Вход в аккаунт',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Пароль',
    showPassword: 'Показать',
    hidePassword: 'Скрыть',
    loginBtn: 'Войти',
    googleBtn: 'Войти через Google',
    facebookBtn: 'Войти через Facebook',
    appleBtn: 'Войти через Apple',
    noAccount: 'Нет аккаунта? ',
    register: 'Зарегистрироваться',
    errorTitle: 'Ошибка',
    errorFields: 'Заполните поля корректно',
    errorLoginTitle: 'Ошибка входа',
    errorLogin: 'Не удалось войти. Проверьте email и пароль.',
    googleLoginFailed: 'Не удалось войти через Google. Попробуйте ещё раз.',
    facebookLoginFailed: 'Не удалось войти через Facebook. Попробуйте ещё раз.',
    socialCanceled: 'Вход отменён пользователем.',
    socialInProgress: 'Вход уже выполняется. Подождите несколько секунд.',
    playServicesMissing: 'Google Play Services недоступен. Обновите сервисы Google.',
    socialConfigError: 'Вход через Google/Facebook не настроен для этой сборки. Обновите приложение или обратитесь в поддержку.',
    socialGeneric: 'Ошибка социального входа. Попробуйте позже.',
    appleLoginFailed: 'Не удалось войти через Apple. Попробуйте ещё раз.',
    loginLocked: 'Слишком много неудачных попыток. Попробуйте снова через 15 минут.',
    forgotPassword: 'Забыли пароль?',
    resetPasswordSent: 'Инструкция по сбросу пароля отправлена на ваш email.',
    resetPasswordNeedEmail: 'Введите корректный email, чтобы сбросить пароль.',
    resetPasswordFailed: 'Не удалось отправить письмо для сброса пароля.',
    inlineEmailError: 'Введите корректный email.',
    inlinePasswordError: 'Пароль должен содержать минимум 6 символов.',
  },
  en: {
    subtitle: 'Sign in to your account',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    showPassword: 'Show',
    hidePassword: 'Hide',
    loginBtn: 'Sign in',
    googleBtn: 'Sign in with Google',
    facebookBtn: 'Sign in with Facebook',
    appleBtn: 'Sign in with Apple',
    noAccount: 'No account? ',
    register: 'Register',
    errorTitle: 'Error',
    errorFields: 'Please fill in the fields correctly',
    errorLoginTitle: 'Sign in error',
    errorLogin: 'Failed to sign in. Check your email and password.',
    googleLoginFailed: 'Could not sign in with Google. Please try again.',
    facebookLoginFailed: 'Could not sign in with Facebook. Please try again.',
    socialCanceled: 'Sign-in was canceled.',
    socialInProgress: 'Sign-in is already in progress. Please wait a moment.',
    playServicesMissing: 'Google Play Services is unavailable. Please update Google services.',
    socialConfigError: 'Google/Facebook sign-in is not configured for this app build. Please update the app or contact support.',
    socialGeneric: 'Social sign-in error. Please try again later.',
    appleLoginFailed: 'Could not sign in with Apple. Please try again.',
    loginLocked: 'Too many failed attempts. Try again in 15 minutes.',
    forgotPassword: 'Forgot password?',
    resetPasswordSent: 'Password reset instructions were sent to your email.',
    resetPasswordNeedEmail: 'Enter a valid email so we can send a password reset link.',
    resetPasswordFailed: 'Could not send the password reset email.',
    inlineEmailError: 'Enter a valid email.',
    inlinePasswordError: 'Password must be at least 6 characters.',
  },
} as const;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<{
    MainTabs: { screen: 'HomeTab' };
    RegisterScreenFull: { name?: string; email?: string; phone?: string; redirectTo?: string; redirectParams?: object; redirectMode?: 'auth' | 'complete' } | undefined;
  }>>();
  const route = useRoute<import('@react-navigation/native').RouteProp<Record<string, { redirectTo?: string; redirectParams?: object; redirectMode?: 'auth' | 'complete' } | undefined>, string>>();
  const dispatch = useDispatch();
  const language = useSelector((state: LangState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);
  const loading = useSelector(selectAuthLoading);
  const error = useSelector(selectAuthError);

  const normalizedEmail = normalizeEmailText(email);
  const isEmailValid = validateEmail(normalizedEmail);
  const isPasswordValid = password.length >= 6;
  const isFormValid = isEmailValid && isPasswordValid;

  const mapSocialAuthError = useCallback(
    (rawError: string | undefined, provider: 'google' | 'facebook' | 'apple') => {
      const raw = (rawError || '').toLowerCase();
      if (raw.includes('canceled')) return text.socialCanceled;
      if (raw.includes('in progress')) return text.socialInProgress;
      if (raw.includes('apple sign-in is not available')) return text.appleLoginFailed;
      if (raw.includes('play services')) return text.playServicesMissing;
      if (raw.includes('invalid-credential') || raw.includes('access token missing') || raw.includes('access_denied')) return text.socialConfigError;
      if (raw.includes('token refresh failed') || raw.includes('sha fingerprints')) return text.socialConfigError;
      if (raw.includes('not configured') || raw.includes('developer_error') || raw.includes('id token missing')) return text.socialConfigError;
      if (provider === 'google') return text.googleLoginFailed;
      if (provider === 'facebook') return text.facebookLoginFailed;
      if (provider === 'apple') return text.appleLoginFailed;
      return text.socialGeneric;
    },
    [text]
  );

  const completeLogin = useCallback(
    async (
      user: FirebaseUser,
      provider: 'google' | 'facebook' | 'apple' | 'email' = 'email',
      ensureProfile = false,
    ) => {
      const appUser = await resolveAppUserFromFirebase(user, {
        ensureProfile,
        provider,
      });
      dispatch(setUser(appUser));
      dispatch(setError(null));
      if (route.params?.redirectTo && route.params.redirectMode === 'auth') {
        navigation.reset({ index: 0, routes: [{ name: route.params.redirectTo as never, params: route.params.redirectParams as never }] });
        return;
      }
      if (appUser.registrationStatus === 'complete') {
        if (route.params?.redirectTo) {
          navigation.reset({ index: 0, routes: [{ name: route.params.redirectTo as never, params: route.params.redirectParams as never }] });
          return;
        }
        navigation.navigate('MainTabs', { screen: 'HomeTab' });
      } else {
        navigation.navigate('RegisterScreenFull', {
          name: appUser.name,
          email: appUser.email,
          phone: appUser.phone,
          redirectTo: route.params?.redirectTo,
          redirectParams: route.params?.redirectParams,
          redirectMode: route.params?.redirectMode,
        });
      }
    },
    [dispatch, navigation]
  );

  useEffect(() => {
    if (error) {
      dispatch(clearError());
    }
  }, [email, password, error, dispatch]);

  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'ios') {
      setAppleSignInAvailable(false);
      return () => {
        active = false;
      };
    }
    void AppleAuthentication.isAvailableAsync()
      .then((available: boolean) => {
        if (active) {
          setAppleSignInAvailable(available);
        }
      })
      .catch(() => {
        if (active) {
          setAppleSignInAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = useCallback(async () => {
    setSubmitAttempted(true);
    if (!isFormValid) {
      Alert.alert(text.errorTitle, text.errorFields);
      return;
    }

    dispatch(setLoading(true));
    try {
      const lock = await readLoginLock(normalizedEmail);
      if (lock.lockedUntil > Date.now()) {
        Alert.alert(text.errorLoginTitle, text.loginLocked);
        return;
      }
      let userCredential;
      try {
        userCredential = await signInWithServerRateLimit(normalizedEmail, password);
      } catch (serverError) {
        if (!__DEV__) {
          throw serverError;
        }
        userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      }
      await clearLoginLock(normalizedEmail);
      await completeLogin(userCredential.user, 'email');
    } catch {
      const lock = await recordLoginFailure(normalizedEmail);
      const message = text.errorLogin;
      dispatch(setError(message));
      Alert.alert(text.errorLoginTitle, lock.lockedUntil > Date.now() ? text.loginLocked : message);
    } finally {
      dispatch(setLoading(false));
    }
  }, [isFormValid, normalizedEmail, password, dispatch, completeLogin, text, text.loginLocked]);

  const handleGoogleLogin = useCallback(async () => {
    dispatch(setLoading(true));
    try {
      const result = await socialAuthAPI.signInWithGoogle();
      if (!result.success) {
        Alert.alert(text.errorLoginTitle, mapSocialAuthError(result.error, 'google'));
        return;
      }
      await completeLogin(result.data, 'google', true);
    } catch {
      Alert.alert(text.errorLoginTitle, text.googleLoginFailed);
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, completeLogin, mapSocialAuthError, text]);

  const handleFacebookLogin = useCallback(async () => {
    dispatch(setLoading(true));
    try {
      const result = await socialAuthAPI.signInWithFacebook();
      if (!result.success) {
        Alert.alert(text.errorLoginTitle, mapSocialAuthError(result.error, 'facebook'));
        return;
      }
      await completeLogin(result.data, 'facebook', true);
    } catch {
      Alert.alert(text.errorLoginTitle, text.facebookLoginFailed);
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, completeLogin, mapSocialAuthError, text]);

  const handleAppleLogin = useCallback(async () => {
    dispatch(setLoading(true));
    try {
      const result = await socialAuthAPI.signInWithApple();
      if (!result.success) {
        Alert.alert(text.errorLoginTitle, mapSocialAuthError(result.error, 'apple'));
        return;
      }
      await completeLogin(result.data, 'apple', true);
    } catch {
      Alert.alert(text.errorLoginTitle, text.appleLoginFailed);
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, completeLogin, mapSocialAuthError, text]);

  const handleForgotPassword = useCallback(async () => {
    if (!isEmailValid) {
      Alert.alert(text.errorTitle, text.resetPasswordNeedEmail);
      return;
    }

    dispatch(setLoading(true));
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      Alert.alert(text.loginBtn, text.resetPasswordSent);
    } catch {
      Alert.alert(text.errorTitle, text.resetPasswordFailed);
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, isEmailValid, normalizedEmail, text]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.logoContainer}>
          <Text style={styles.appTitle}>Chaika Life</Text>
          <Text style={styles.appSubtitle}>{text.subtitle}</Text>
        </View>

        <TactileCard elevated style={styles.formCard} pressable={false}>
          {error ? <Text style={styles.errorBannerText}>{error}</Text> : null}

          <TactileInput
            placeholder={text.emailPlaceholder}
            value={email}
            onChangeText={(value) => setEmail(normalizeEmailText(value))}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
          <FormFieldError visible={submitAttempted && !isEmailValid} error={text.inlineEmailError} />
          <View style={styles.passwordRow}>
            <TactileInput
              placeholder={text.passwordPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} disabled={loading}>
              <Text style={styles.toggleText}>{showPassword ? text.hidePassword : text.showPassword}</Text>
            </TouchableOpacity>
          </View>
          <FormFieldError visible={submitAttempted && !isPasswordValid} error={text.inlinePasswordError} />
          <TouchableOpacity onPress={() => void handleForgotPassword()} disabled={loading} style={styles.forgotPasswordWrap}>
            <Text style={styles.forgotPasswordText}>{text.forgotPassword}</Text>
          </TouchableOpacity>

          <View style={styles.btnSpacing}>
            <TactileButton
              title={text.loginBtn}
              onPress={handleLogin}
              disabled={!isFormValid || loading}
              variant="primary"
              style={styles.loginButtonStyle}
              textStyle={styles.loginButtonText}
            />
            {loading && <ActivityIndicator size="small" color="#FFFFFF" style={styles.loaderOverlay} />}
          </View>

          <View style={styles.btnSpacing}>
            <TactileButton
              title={text.googleBtn}
              onPress={handleGoogleLogin}
              disabled={loading}
              variant="secondary"
            />
          </View>

          <View style={styles.btnSpacing}>
            <TactileButton
              title={text.facebookBtn}
              onPress={handleFacebookLogin}
              disabled={loading}
              variant="social"
            />
          </View>

          {Platform.OS === 'ios' && appleSignInAvailable ? (
            <View style={styles.btnSpacing}>
              <TactileButton
                title={text.appleBtn}
                onPress={handleAppleLogin}
                disabled={loading}
                variant="secondary"
              />
            </View>
          ) : null}
        </TactileCard>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>{text.noAccount}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('RegisterScreenFull', route.params)} disabled={loading}>
            <Text style={styles.signupLink}>{text.register}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { paddingHorizontal: 16, paddingVertical: 24, paddingBottom: 32 },
  logoContainer: { alignItems: 'center', marginBottom: 32, paddingTop: 16 },
  appTitle: { fontSize: 32, fontWeight: '900', color: SCREEN_THEME.terracottaDark, marginTop: 12 },
  appSubtitle: { fontSize: 14, color: SCREEN_THEME.textSecondary, marginTop: 4, fontWeight: '600' },
  formCard: { padding: 20, marginBottom: 20 },
  errorBannerText: { fontSize: 13, color: '#C62828', fontWeight: '600', marginBottom: 12 },
  passwordRow: { marginBottom: 10, gap: 6 },
  toggleText: { color: SCREEN_THEME.terracottaDark, fontWeight: '700', marginTop: 6 },
  forgotPasswordWrap: { alignSelf: 'flex-end', marginBottom: 4 },
  forgotPasswordText: { color: SCREEN_THEME.terracottaDark, fontSize: 13, fontWeight: '700' },
  btnSpacing: { marginTop: 12 },
  loginButtonStyle: {
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
  },
  loginButtonText: {
    color: '#2F1C12',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  loaderOverlay: { position: 'absolute', alignSelf: 'center', top: 12 },
  signupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  signupText: { fontSize: 14, color: SCREEN_THEME.textSecondary },
  signupLink: { fontSize: 14, color: SCREEN_THEME.terracottaDark, fontWeight: '800' },
});

export default LoginScreen;

