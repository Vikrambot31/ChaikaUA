# План iOS-версии приложения «ЖК Чайка» / Chaika Life

Цель: подготовить iPhone-версию приложения к сборке, TestFlight и App Store Review с минимальным риском отказа.

Дата ревизии: 2026-06-20.

## 0. Что уже найдено в проекте

- Expo SDK 50, React Native 0.73.6, TypeScript.
- `app.json` уже содержит `ios.bundleIdentifier: com.chaikaua.mobile`, но iOS-секция неполная.
- `expo-apple-authentication` уже есть в `package.json` и добавлен в `app.config.js`.
- На экране `src/screens/Vkhod.tsx` уже есть логика Apple Sign-In.
- `eas.json` сейчас содержит только Android-профили `preview`, `development`, `production`.
- В `app.json` повреждены русские/украинские тексты разрешений iOS и plugin permission-тексты. Это риск отказа App Review.
- Папка плана переименована без точки в конце: `C:\ChaikaUA\mobile-app-short\IOS - Айфон версия`.

## 1. Блокеры перед первой iOS-сборкой

- [ ] Купить/активировать Apple Developer Program.
- [ ] Создать App ID с bundle id `com.chaikaua.mobile`.
- [ ] Включить Capabilities: Push Notifications, Sign In with Apple, Associated Domains только если реально нужны deep links.
- [ ] Создать iOS-приложение в Firebase Console с тем же bundle id.
- [ ] Скачать `GoogleService-Info.plist`.
- [ ] Добавить `ios.googleServicesFile` в `app.json` или `app.config.js`.
- [ ] Исправить все iOS permission descriptions на нормальный UTF-8 текст.
- [ ] Добавить iOS-профили в `eas.json`.
- [ ] Проверить сборку на реальном iPhone, не только на симуляторе.

## 2. Исправить конфиг Expo

В `app.json` / `app.config.js` надо довести iOS-секцию до такого состояния:

```json
"ios": {
  "bundleIdentifier": "com.chaikaua.mobile",
  "supportsTablet": true,
  "buildNumber": "1",
  "googleServicesFile": "./GoogleService-Info.plist",
  "infoPlist": {
    "NSLocationWhenInUseUsageDescription": "Показываем места и сервисы ЖК Чайка рядом с вами.",
    "NSCameraUsageDescription": "Камера нужна для добавления фото к заявкам, объявлениям и профилю.",
    "NSPhotoLibraryUsageDescription": "Доступ к фото нужен для выбора изображений из галереи.",
    "NSPhotoLibraryAddUsageDescription": "Разрешение нужно для сохранения изображений, если вы выберете такую функцию.",
    "NSMicrophoneUsageDescription": "Микрофон нужен для записи голосовых сообщений.",
    "UIBackgroundModes": ["remote-notification"]
  },
  "config": {
    "usesNonExemptEncryption": false
  }
}
```

Важно: не добавлять разрешения «на всякий случай». Apple может отклонить приложение, если permission есть, а сценарий в приложении неочевиден.

## 3. EAS Build

Добавить iOS-профили в `eas.json`:

```json
{
  "build": {
    "ios-simulator": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "ios-preview": {
      "distribution": "internal",
      "channel": "ios-preview",
      "ios": {
        "buildConfiguration": "Release"
      }
    },
    "ios-production": {
      "channel": "ios-production",
      "ios": {
        "buildConfiguration": "Release"
      }
    }
  },
  "submit": {
    "ios-production": {
      "ios": {
        "appleId": "",
        "ascAppId": "",
        "appleTeamId": ""
      }
    }
  }
}
```

Команды:

```bash
eas build --platform ios --profile ios-simulator
eas build --platform ios --profile ios-preview
eas build --platform ios --profile ios-production
eas submit --platform ios --profile ios-production
```

Примечание: `eas build --auto-submit` использовать только после успешного TestFlight-прогона.

## 4. Firebase, FCM и Push на iOS

- [ ] В Firebase добавить iOS app `com.chaikaua.mobile`.
- [ ] Скачать `GoogleService-Info.plist` и подключить его в Expo config.
- [ ] В Apple Developer создать APNs Auth Key.
- [ ] Загрузить APNs Key в Firebase Cloud Messaging.
- [ ] Проверить `@react-native-firebase/messaging` на реальном iPhone.
- [ ] Проверить foreground, background и killed-state уведомления.
- [ ] Проверить, что notification permission запрашивается после понятного действия пользователя, а не сразу на старте.

Риск: push не проверить на обычном iOS Simulator как полноценный production-сценарий. Нужен физический iPhone.

## 5. Авторизация и риск отказа Apple

Если в приложении есть Google/Facebook/social login, Apple требует Sign in with Apple как равнозначный вариант входа.

- [ ] Проверить `src/screens/Vkhod.tsx`: кнопка Apple видна на iOS.
- [ ] Проверить полный флоу: Apple credential -> Firebase Auth -> профиль пользователя -> выход -> повторный вход.
- [ ] Проверить сценарий скрытого email Apple (`privaterelay.appleid.com`).
- [ ] Добавить в Firebase Auth провайдер Apple.
- [ ] Проверить, что Facebook login не активируется без корректных iOS настроек.
- [ ] Если Facebook SDK включается через env, заполнить App Store privacy labels для Facebook SDK.

## 6. App Privacy, Legal, Review Notes

Обязательно подготовить до отправки в App Review:

- [ ] Privacy Policy URL.
- [ ] Support URL.
- [ ] Terms / пользовательское соглашение, если есть аккаунты, контент пользователей, модерация, объявления.
- [ ] App Privacy questionnaire в App Store Connect:
  - Account identifiers.
  - User content: фото, заявки, объявления, сообщения.
  - Location, если реально используется карта/геолокация.
  - Diagnostics/crash data, если включен Crashlytics.
  - Push notification token / device identifiers.
- [ ] Review Notes: дать тестовый аккаунт и короткий маршрут проверки.
- [ ] Если часть функций доступна только жильцам/модераторам, объяснить это ревьюеру.

## 7. User Generated Content и модерация

У приложения есть фото, заявки, объявления, комментарии/сообщения. Для Apple это зона риска UGC.

- [ ] В приложении должен быть механизм жалобы на контент.
- [ ] Должна быть возможность блокировки/ограничения нарушителя.
- [ ] Должна быть модерация контента или пост-модерация.
- [ ] Должен быть понятный контакт поддержки.
- [ ] В Review Notes описать, как работает модерация.

## 8. iOS-адаптация кода

Проверить реальные найденные места:

- [ ] `src/photo-module/MyPhotosScreen.tsx`: `BackHandler` должен выполняться только на Android.
- [ ] `src/services/apkInstallService.ts`: Android-only сервис не должен попадать в iOS UI-сценарии.
- [ ] `src/firebase-core.ts`: Google Sign-In должен иметь iOS client id / reversed client id.
- [ ] `src/firebase-config.ts`: проверить Apple Sign-In и FCM на iOS.
- [ ] `src/hooks/useFCMToken.ts`: проверить канал уведомлений только для Android, iOS без channelId.
- [ ] `src/utils/photoPicker.ts`: проверить limited photo library на iOS.
- [ ] Все `KeyboardAvoidingView`: проверить формы на iPhone SE, iPhone 15/16 Pro Max.
- [ ] Все экраны с верхним/нижним меню: проверить safe area и home indicator.

Команды аудита:

```bash
rg -n "Platform\.OS|BackHandler|StatusBar\.currentHeight|PermissionsAndroid|IntentLauncher|ToastAndroid" src App.tsx
rg -n "GoogleSignin|AppleAuthentication|messaging|Notifications.requestPermissionsAsync" src App.tsx
```

## 9. Карты, фото, микрофон, геолокация

- [ ] `react-native-maps`: проверить, нужен ли Google Maps на iOS или достаточно Apple Maps.
- [ ] Если используются Google Maps на iOS, добавить iOS API key и настройки.
- [ ] Проверить выбор фото из галереи при `limited access`.
- [ ] Проверить съемку фото камерой.
- [ ] Проверить запись голоса и повторное разрешение после отказа.
- [ ] Проверить сценарий, когда пользователь отказал в permission: должна быть понятная кнопка перехода в Settings.

## 10. App Store метаданные

- [ ] Название: `Chaika Life` или локализованное название.
- [ ] Subtitle.
- [ ] Keywords.
- [ ] Description на украинском/русском/английском, если нужны локализации.
- [ ] Category.
- [ ] Age Rating.
- [ ] Copyright.
- [ ] Support URL.
- [ ] Privacy Policy URL.
- [ ] Скриншоты минимум для актуальных iPhone размеров.

Риск: скриншоты должны показывать реальный интерфейс приложения, не только маркетинговые картинки.

## 11. Скриншоты

Минимальный набор:

- [ ] 6.7" / 6.9" современные Pro Max размеры.
- [ ] 6.5" если App Store Connect просит legacy-размер.
- [ ] 5.5" только если требуется для старых устройств/локалей.
- [ ] 3-5 ключевых экранов: главный экран, карта/места, заявка, профиль/сообщения, уведомления.

Перед скриншотами:

- [ ] Убрать тестовые email, debug labels, dev banners.
- [ ] Проверить, что нет приватных данных жителей.
- [ ] Проверить язык интерфейса.

## 12. TestFlight перед App Review

- [ ] Установить build через TestFlight на физический iPhone.
- [ ] Пройти cold start, login, logout.
- [ ] Создать заявку с фото.
- [ ] Открыть карту.
- [ ] Проверить push.
- [ ] Проверить Apple Sign-In.
- [ ] Проверить восстановление пароля.
- [ ] Проверить отсутствие crash при отказе от permissions.
- [ ] Проверить работу без сети и при слабой сети.
- [ ] Проверить, что нет Android-APK/Google Play текстов внутри iOS.

## 13. Частые причины отказа App Review

- Битые или непонятные permission descriptions.
- Есть Google/Facebook login, но нет Sign in with Apple.
- Нельзя войти ревьюеру или нет тестового аккаунта.
- Приложение падает на iPhone.
- Пустые экраны из-за Firebase rules/permissions.
- Запрос разрешений без объяснения пользовательской пользы.
- UGC без жалоб, блокировок или модерации.
- Privacy labels не совпадают с реальным сбором данных.
- В приложении есть Android-only элементы: APK, Play Market, кнопка установки APK.
- Скрытые платные функции без корректного IAP, если продается цифровой контент.
- Не работает удаление аккаунта, если аккаунты создаются в приложении.

## 14. Удаление аккаунта

Apple требует, чтобы приложение с созданием аккаунта имело возможность удалить аккаунт.

- [ ] Проверить, есть ли в приложении создание аккаунта.
- [ ] Добавить/проверить кнопку удаления аккаунта в настройках профиля.
- [ ] Удаление должно удалять или обезличивать профильные данные по понятной политике.
- [ ] Если удаление выполняется через поддержку, это может быть недостаточно для Apple.

## 15. Платежи и подписки

Если в приложении есть платные цифровые функции, бонусы, подписки или продвижение:

- [ ] Проверить, не нарушает ли это App Store In-App Purchase rules.
- [ ] Для цифрового контента/функций использовать Apple IAP.
- [ ] Для физических услуг можно использовать внешние платежи, если это реально офлайн/физическая услуга.
- [ ] Не показывать пользователю обход оплаты Apple для цифровых функций.

## 16. OTA / EAS Update

Сейчас в `app.json` `updates.enabled` выключен.

- [ ] Если OTA не используется, убрать из плана формулировку `Code Push`.
- [ ] Если EAS Update нужен, включать только после стратегии каналов и runtimeVersion.
- [ ] Не отправлять через OTA изменения, которые требуют нового native build.
- [ ] Для App Review фиксировать тот же update channel, который тестировался в TestFlight.

## 17. CI/CD

- [ ] Добавить отдельные команды:
  - `npm run type-check`
  - `npm test`
  - `eas build --platform ios --profile ios-preview`
- [ ] Хранить Apple/EAS/Firebase секреты только в EAS secrets или GitHub Actions secrets.
- [ ] Не коммитить `GoogleService-Info.plist`, если внутри есть чувствительные значения и политика проекта запрещает это.
- [ ] Перед production build проверять чистый git status, потому что `eas.json` содержит `requireCommit: true`.

## 18. Финальный чеклист перед отправкой

- [ ] iOS build проходит.
- [ ] TestFlight build установлен на физический iPhone.
- [ ] Apple Sign-In работает.
- [ ] Google/Facebook login либо работает на iOS, либо скрыт/отключен.
- [ ] Push работает на физическом iPhone.
- [ ] Permission texts исправлены и понятны.
- [ ] Privacy Policy и Support URL доступны публично.
- [ ] App Privacy заполнен честно.
- [ ] Есть тестовый аккаунт для ревью.
- [ ] Есть удаление аккаунта.
- [ ] UGC-модерация описана.
- [ ] Нет Android-only сценариев в iOS.
- [ ] Нет битой кодировки в интерфейсе и конфиге.
- [ ] Скриншоты соответствуют реальному приложению.

## 19. Что не трогать без отдельного разрешения

По guardrails проекта не менять без явного подтверждения:

- `admin-panel/src/services/authService.ts`
- `admin-panel/src/firebase/firebase.ts`
- `firebase.rules.json`
- логику `user_roles`, `security_config`, `authorized_devices`
- owner/admin path через `VITE_ADMIN_SERVICE_EMAIL`

Эти файлы не нужны для базовой iOS-сборки. Если iOS-тест выявит `permission-denied`, сначала диагностировать сценарий, а не сразу менять security rules.
