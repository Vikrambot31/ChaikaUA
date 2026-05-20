import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../utils/constants';
import {
  isValidSponsorPhone,
  normalizeSponsorPhone,
  submitInviteRequest,
} from '../services/sponsorService';

type InviteAccessScreenProps = {
  requesterPhone: string;
  onSubmitted: () => void;
  onContinue: () => void;
};

const PHONE_PLACEHOLDER = '+380XXXXXXXXX';

export default function InviteAccessScreen({
  requesterPhone,
  onSubmitted,
  onContinue,
}: InviteAccessScreenProps) {
  const [sponsorPhone, setSponsorPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const normalizedRequesterPhone = useMemo(() => normalizeSponsorPhone(requesterPhone), [requesterPhone]);
  const normalizedSponsorPhone = useMemo(() => normalizeSponsorPhone(sponsorPhone), [sponsorPhone]);
  const canSubmit = isValidSponsorPhone(normalizedRequesterPhone) && isValidSponsorPhone(normalizedSponsorPhone) && !loading;

  const handleSubmit = async () => {
    if (!isValidSponsorPhone(normalizedRequesterPhone)) {
      setMessage('Ваш телефон должен быть в формате +380XXXXXXXXX.');
      return;
    }
    if (!isValidSponsorPhone(normalizedSponsorPhone)) {
      setMessage('Телефон поручителя должен быть в формате +380XXXXXXXXX.');
      return;
    }
    if (normalizedRequesterPhone === normalizedSponsorPhone) {
      setMessage('Телефон поручителя должен отличаться от вашего телефона.');
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await submitInviteRequest(normalizedRequesterPhone, normalizedSponsorPhone);
      setMessage('Заявка отправлена. Мы покажем статус после проверки.');
      onSubmitted();
    } catch {
      setMessage('Не удалось отправить заявку. Проверьте связь и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Invite Access</Text>
        <Text style={styles.title}>Поручитель</Text>
        <Text style={styles.subtitle}>
          Укажите телефон поручителя в формате +380XXXXXXXXX. Ответ на экране всегда общий, чтобы не раскрывать данные поручителей.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Ваш телефон</Text>
          <TextInput
            value={normalizedRequesterPhone}
            editable={false}
            style={[styles.input, styles.inputDisabled]}
            placeholder={PHONE_PLACEHOLDER}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Телефон поручителя</Text>
          <TextInput
            value={sponsorPhone}
            onChangeText={setSponsorPhone}
            style={styles.input}
            placeholder={PHONE_PLACEHOLDER}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            maxLength={13}
          />
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Отправить заявку</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={onContinue}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Продолжить без заявки</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#EEF3FB',
  },
  panel: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8E4F4',
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: '#25324A',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: '#607594',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    color: '#40516A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#C9D9EF',
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    color: '#25324A',
    fontSize: 16,
    fontWeight: '700',
  },
  inputDisabled: {
    backgroundColor: '#F4F7FB',
    color: '#607594',
  },
  message: {
    color: '#40516A',
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C9D9EF',
    marginTop: 10,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#40516A',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
