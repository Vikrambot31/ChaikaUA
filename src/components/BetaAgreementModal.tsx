import React, { useCallback, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SCREEN_THEME } from '../utils/screenTheme';

// ─── Texts ──────────────────────────────────────────────────────────────────

const CONTENT = {
  ua: {
    badge: 'БЕТА-ВЕРСІЯ',
    title: 'Угода користувача',
    subtitle: 'Прочитайте та підтвердьте перед тим, як продовжити',
    scrollHint: '↓ Прокрутіть вниз, щоб прочитати повністю',
    buttonLabel: 'Прочитав(-ла), погоджуюсь',
    sections: [
      {
        heading: '⚠️ Це бета-версія застосунку',
        body:
          'Chaika Life перебуває на етапі бета-тестування. Застосунок може містити помилки, нестабільності та незавершені функції. Окремі можливості можуть змінюватися або бути видалені без попередження. Сервіс надається «як є» — без гарантій безперебійної роботи.',
      },
      {
        heading: '💳 Підписка в бета-режимі',
        body:
          'Підписка надає доступ до преміум-функцій, однак Розробник не гарантує рівень сервісу (SLA). Вартість і перелік функцій можуть змінюватися після завершення бета-тесту. Оплата здійснюється за реквізитами, наданими підтримкою. Повернення коштів — протягом 14 днів із дня оплати (ЗУ «Про захист прав споживачів», ст. 8).',
      },
      {
        heading: '🔒 Персональні дані',
        body:
          'Ваші дані (ім\'я, email, телефон, адреса, фото) зберігаються в Firebase (Google Cloud, США). Натискаючи «Погоджуюсь», ви надаєте згоду на обробку та транскордонну передачу персональних даних відповідно до ЗУ «Про захист персональних даних». Ви можете запросити видалення даних, звернувшись на support_chaika_ua@ukr.net.',
      },
      {
        heading: '🔔 Push-повідомлення',
        body:
          'Застосунок може надсилати сповіщення про заявки, відповіді та оновлення сервісу. Ви можете відмовитись у системних налаштуваннях пристрою в будь-який момент.',
      },
      {
        heading: '👤 Вік та відповідальність',
        body:
          'Мінімальний вік — 14 років (ст. 32 ЦКУ). Ви використовуєте Застосунок добровільно і на власний ризик. Розробник не несе відповідальності за втрату даних або перебої в роботі під час бета-тестування. Максимальна відповідальність обмежена сумою, сплаченою за останні 3 місяці.',
      },
      {
        heading: '⚔️ Форс-мажор',
        body:
          'З огляду на воєнний стан в Україні, перебої в роботі сервісу, спричинені обставинами непереборної сили (бойові дії, відключення зв\'язку, кібератаки), не є підставою для претензій до Розробника (ст. 617, 652 ЦКУ).',
      },
      {
        heading: '📄 Повна версія угоди',
        body:
          'Повний текст Угоди користувача (публічна оферта) доступний у файлі LEGAL_AGREEMENT_BETA_UA.md у документації застосунку або за запитом на support_chaika_ua@ukr.net.\n\nВикористовуючи Застосунок, ви також погоджуєтесь із Політикою конфіденційності та Умовами підписки.',
      },
    ],
  },
  ru: {
    badge: 'БЕТА-ВЕРСИЯ',
    title: 'Пользовательское соглашение',
    subtitle: 'Прочитайте и подтвердите перед тем, как продолжить',
    scrollHint: '↓ Прокрутите вниз, чтобы прочитать полностью',
    buttonLabel: 'Прочитал(-а), соглашаюсь',
    sections: [
      {
        heading: '⚠️ Это бета-версия приложения',
        body:
          'Chaika Life находится на этапе бета-тестирования. Приложение может содержать ошибки, нестабильности и незавершённые функции. Отдельные возможности могут изменяться или удаляться без предупреждения. Сервис предоставляется «как есть» — без гарантий бесперебойной работы.',
      },
      {
        heading: '💳 Подписка в бета-режиме',
        body:
          'Подписка предоставляет доступ к премиум-функциям, однако Разработчик не гарантирует уровень сервиса (SLA). Стоимость и перечень функций могут измениться после завершения бета-теста. Оплата производится по реквизитам, предоставленным поддержкой. Возврат средств — в течение 14 дней с даты оплаты.',
      },
      {
        heading: '🔒 Персональные данные',
        body:
          'Ваши данные (имя, email, телефон, адрес, фото) хранятся в Firebase (Google Cloud, США). Нажимая «Соглашаюсь», вы даёте согласие на обработку и трансграничную передачу персональных данных. Вы можете запросить удаление данных, обратившись на support_chaika_ua@ukr.net.',
      },
      {
        heading: '🔔 Push-уведомления',
        body:
          'Приложение может отправлять уведомления о заявках, ответах и обновлениях сервиса. Вы можете отказаться в системных настройках устройства в любой момент.',
      },
      {
        heading: '👤 Возраст и ответственность',
        body:
          'Минимальный возраст — 14 лет. Вы используете Приложение добровольно и на собственный риск. Разработчик не несёт ответственности за потерю данных или сбои в работе во время бета-тестирования. Максимальная ответственность ограничена суммой, уплаченной за последние 3 месяца.',
      },
      {
        heading: '⚔️ Форс-мажор',
        body:
          'С учётом военного положения в Украине, сбои в работе сервиса, вызванные обстоятельствами непреодолимой силы, не являются основанием для претензий к Разработчику.',
      },
      {
        heading: '📄 Полная версия соглашения',
        body:
          'Полный текст Пользовательского соглашения (публичная оферта) доступен в документации приложения или по запросу на support_chaika_ua@ukr.net.\n\nИспользуя Приложение, вы также соглашаетесь с Политикой конфиденциальности и Условиями подписки.',
      },
    ],
  },
  en: {
    badge: 'BETA VERSION',
    title: 'User Agreement',
    subtitle: 'Please read and confirm before continuing',
    scrollHint: '↓ Scroll down to read the full text',
    buttonLabel: 'I have read and agree',
    sections: [
      {
        heading: '⚠️ This is a beta version',
        body:
          'Chaika Life is in beta testing. The app may contain bugs, instabilities, and incomplete features. Specific capabilities may change or be removed without notice. The service is provided "as is" — without guarantees of uninterrupted operation.',
      },
      {
        heading: '💳 Subscription in beta mode',
        body:
          'The subscription provides access to premium features, but the Developer does not guarantee a service level (SLA). Pricing and feature list may change after beta. Payment is made via details provided by support. Refunds are available within 14 days of payment.',
      },
      {
        heading: '🔒 Personal data',
        body:
          'Your data (name, email, phone, address, photos) is stored in Firebase (Google Cloud, USA). By tapping "Agree", you consent to the processing and cross-border transfer of personal data. You can request data deletion by contacting support_chaika_ua@ukr.net.',
      },
      {
        heading: '🔔 Push notifications',
        body:
          'The app may send notifications about requests, replies, and service updates. You can opt out in your device system settings at any time.',
      },
      {
        heading: '👤 Age & responsibility',
        body:
          'Minimum age is 14 years. You use the App voluntarily and at your own risk. The Developer is not liable for data loss or service interruptions during beta testing. Maximum liability is limited to the amount paid in the last 3 months.',
      },
      {
        heading: '⚔️ Force majeure',
        body:
          'Given the state of war in Ukraine, service disruptions caused by force majeure (hostilities, outages, cyberattacks) are not grounds for claims against the Developer.',
      },
      {
        heading: '📄 Full agreement',
        body:
          'The full User Agreement (public offer) is available in the app documentation or upon request at support_chaika_ua@ukr.net.\n\nBy using the App, you also agree to the Privacy Policy and Subscription Terms.',
      },
    ],
  },
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface BetaAgreementModalProps {
  visible: boolean;
  language: 'ua' | 'ru' | 'en';
  onAccept: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BetaAgreementModal({ visible, language, onAccept }: BetaAgreementModalProps) {
  const content = CONTENT[language] ?? CONTENT.ua;
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 60;
    if (isNearBottom && !scrolledToBottom) {
      setScrolledToBottom(true);
    }
  }, [scrolledToBottom]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
    >
      <View style={styles.root}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>{content.badge}</Text>
          </View>
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.subtitle}>{content.subtitle}</Text>
        </View>

        {/* ── Scroll hint ── */}
        {!scrolledToBottom && (
          <View style={styles.scrollHintBar}>
            <MaterialCommunityIcons name="arrow-down" size={14} color={SCREEN_THEME.terracottaDark} />
            <Text style={styles.scrollHintText}>{content.scrollHint}</Text>
          </View>
        )}

        {/* ── Agreement text ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          showsVerticalScrollIndicator
        >
          {content.sections.map((section, idx) => (
            <View key={idx} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
          {/* Bottom padding so last section clears the button */}
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* ── Accept button ── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.acceptButton, !scrolledToBottom && styles.acceptButtonDimmed]}
            activeOpacity={0.82}
            onPress={onAccept}
          >
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={20}
              color="#FBF8FD"
            />
            <Text style={styles.acceptButtonText}>{content.buttonLabel}</Text>
          </TouchableOpacity>

          {!scrolledToBottom && (
            <Text style={styles.scrollReminder}>
              {language === 'ua'
                ? 'Прокрутіть угоду вниз перед підтвердженням'
                : language === 'ru'
                ? 'Прокрутите соглашение вниз перед подтверждением'
                : 'Scroll to the bottom before confirming'}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  header: {
    backgroundColor: SCREEN_THEME.paperStrong,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D0AB',
    alignItems: 'center',
    gap: 6,
  },
  betaBadge: {
    backgroundColor: '#C79C47',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  betaBadgeText: {
    color: '#FBF8FD',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  scrollHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(199,156,71,0.10)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(199,156,71,0.20)',
    paddingVertical: 6,
  },
  scrollHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: SCREEN_THEME.terracottaDark,
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 18,
  },

  section: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 6,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 20,
  },
  sectionBody: {
    fontSize: 13,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 20,
  },

  footer: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
    padding: 16,
    paddingBottom: 32,
    gap: 8,
    alignItems: 'center',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#5C7A5C',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 24,
    width: '100%',
    ...SCREEN_THEME.raisedShadow,
  },
  acceptButtonDimmed: {
    opacity: 0.55,
  },
  acceptButtonText: {
    color: '#FBF8FD',
    fontSize: 15,
    fontWeight: '900',
  },
  scrollReminder: {
    fontSize: 12,
    fontWeight: '700',
    color: SCREEN_THEME.textMuted,
    textAlign: 'center',
  },
});
