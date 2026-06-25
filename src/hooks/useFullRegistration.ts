import { useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp } from '@react-navigation/native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { equalTo, get, orderByChild, query, ref as dbRef, set as dbSet } from 'firebase/database';
import Toast from 'react-native-toast-message';
import { useDispatch } from 'react-redux';
import { auth, database } from '../firebase-config';
import { Building } from '../data/buildings';
import { setError, setLoading, setUser } from '../redux/slices/authSlice';
import { loadProfileRecord, mapFirebaseUserToAppUser, uploadProfilePhoto } from '../services/authProfileService';
import { getPasswordBreachCount } from '../utils/passwordBreachCheck';
import {
  clearSelectedStartAvatar,
  clearTempProfileData,
  getSelectedStartAvatar,
  loadTempProfileData,
} from '../utils/startAvatars';
import { normalizePhoneText } from '../utils/textUtils';
import { RegistrationFullText } from '../screens/registrationFullText';

export type QuickRegistrationParams = {
  name?: string;
  email?: string;
  phone?: string;
  redirectTo?: string;
  redirectParams?: object;
  redirectMode?: 'auth' | 'complete';
};

type FullRegistrationInput = {
  currentProvider?: string;
  draftKey: string;
  isCompletingExistingAccount: boolean;
  isFormValid: boolean;
  navigation: NavigationProp<Record<string, object | undefined>>;
  normalizedEmail: string;
  normalizedName: string;
  normalizedPhone: string;
  password: string;
  referrerPhone: string;
  routeParams?: QuickRegistrationParams;
  selectedBuilding?: Building;
  text: RegistrationFullText;
};

const getRegistrationErrorMessage = (err: unknown, text: RegistrationFullText) => {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return text.emailInUse;
    case 'auth/invalid-email':
      return text.invalidEmail;
    case 'auth/weak-password':
      return text.weakPassword;
    case 'auth/network-request-failed':
    case 'unavailable':
      return text.networkError;
    case 'auth/too-many-requests':
      return text.tooManyRequests;
    case 'permission-denied':
    case 'auth/operation-not-allowed':
      return text.permissionDenied;
    default:
      return text.registerFailed;
  }
};

export const useFullRegistration = ({
  currentProvider,
  draftKey,
  isCompletingExistingAccount,
  isFormValid,
  navigation,
  normalizedEmail,
  normalizedName,
  normalizedPhone,
  password,
  referrerPhone,
  routeParams,
  selectedBuilding,
  text,
}: FullRegistrationInput) => {
  const dispatch = useDispatch();
  const isSubmittingRef = useRef(false);

  const handleRegister = useCallback(async () => {
    if (isSubmittingRef.current) {
      return;
    }

    if (!isFormValid) {
      Toast.show({
        type: 'error',
        text1: text.error,
        text2: text.invalid,
      });
      return;
    }

    isSubmittingRef.current = true;
    dispatch(setLoading(true));

    try {
      if (!isCompletingExistingAccount) {
        let breachCount: number | null = null;
        try {
          breachCount = await getPasswordBreachCount(password);
        } catch {
          // HIBP unavailable — log and continue, do not block registration
          console.warn('[Registration] HIBP check unavailable, skipping');
        }

        if (breachCount !== null && breachCount > 0) {
          dispatch(setError(text.passwordBreached));
          Toast.show({ type: 'error', text1: text.error, text2: text.passwordBreached });
          return;
        }
      }

      if (referrerPhone) {
        const normalizedReferrer = normalizePhoneText(referrerPhone);
        let referrerVerified = false;
        try {
          const referrerSnap = await get(query(dbRef(database, 'users'), orderByChild('phone'), equalTo(normalizedReferrer)));
          const referrerSnapAlt = await get(query(dbRef(database, 'users'), orderByChild('phone'), equalTo(referrerPhone.trim())));
          referrerVerified = referrerSnap.exists() || referrerSnapAlt.exists();
        } catch (dbError: unknown) {
          console.warn('[Registration] Referrer lookup failed:', dbError);
          dispatch(setError(text.error));
          Toast.show({ type: 'error', text1: text.error, text2: text.error });
          return;
        }

        if (!referrerVerified) {
          dispatch(setError(text.referrerNotFound));
          Toast.show({ type: 'error', text1: text.error, text2: text.referrerNotFound });
          return;
        }
      }

      const authUser = isCompletingExistingAccount
        ? auth.currentUser
        : (await createUserWithEmailAndPassword(auth, normalizedEmail, password)).user;

      if (!authUser) {
        throw new Error('Authentication required');
      }

      await updateProfile(authUser, { displayName: normalizedName });

      const uid = authUser.uid;
      const selectedStartAvatar = await getSelectedStartAvatar();
      const tempProfile = await loadTempProfileData();

      let avatarUri = authUser.photoURL || selectedStartAvatar?.uri || (tempProfile ? `start-avatar://${tempProfile.startAvatarKey}` : '');
      let avatarKey = selectedStartAvatar?.key || tempProfile?.startAvatarKey;

      if (!authUser.photoURL && tempProfile?.customAvatarUri) {
        try {
          const uploaded = await uploadProfilePhoto(tempProfile.customAvatarUri, { moderationStatus: 'approved' });
          avatarUri = uploaded.url;
          avatarKey = '';
        } catch {
          // Upload failed — fall back to start avatar
        }
      }

      await dbSet(dbRef(database, `users/${uid}`), {
        name: tempProfile?.name || normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        building: selectedBuilding?.street || '',
        houseNumber: selectedBuilding?.houseNumber || '',
        registeredAt: new Date().toISOString(),
        registrationStatus: 'complete',
        privacyVersion: 2,
        addressProtected: true,
        provider: currentProvider || 'email',
        providerId: uid,
        photoURL: avatarUri,
        ...(avatarKey ? { startAvatarKey: avatarKey } : {}),
        ...(tempProfile?.gender ? { gender: tempProfile.gender } : {}),
        ...(tempProfile?.age ? { age: tempProfile.age } : {}),
        ...(referrerPhone ? { referrerPhone } : {}),
      });

      dispatch(
        setUser(
          mapFirebaseUserToAppUser(
            authUser,
            await loadProfileRecord(uid),
          )
        )
      );

      await AsyncStorage.removeItem(draftKey);
      if (selectedStartAvatar) {
        await clearSelectedStartAvatar();
      }
      await clearTempProfileData();
      dispatch(setError(null));
      Toast.show({
        type: 'success',
        text1: text.success,
        text2: text.done,
      });

      if (routeParams?.redirectTo) {
        try {
          navigation.reset({
            index: 0,
            routes: [{ name: routeParams.redirectTo, params: routeParams.redirectParams }],
          });
          return;
        } catch {
          Toast.show({ type: 'info', text1: text.error, text2: text.invalidRedirect });
        }
      }

      navigation.reset({ index: 0, routes: [{ name: 'ProfileSetupScreen' }] });
    } catch (err: unknown) {
      const message = getRegistrationErrorMessage(err, text);
      dispatch(setError(message));
      Toast.show({ type: 'error', text1: text.error, text2: message });
    } finally {
      isSubmittingRef.current = false;
      dispatch(setLoading(false));
    }
  }, [
    currentProvider,
    dispatch,
    draftKey,
    isCompletingExistingAccount,
    isFormValid,
    navigation,
    normalizedEmail,
    normalizedName,
    normalizedPhone,
    password,
    referrerPhone,
    routeParams,
    selectedBuilding?.houseNumber,
    selectedBuilding?.street,
    text,
  ]);

  return { handleRegister };
};
