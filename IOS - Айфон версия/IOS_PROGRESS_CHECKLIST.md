# iOS: прогресс и оставшийся чек-лист

Дата: 2026-06-21

## Сделано в этом чате

- [x] Создана папка `IOS - Айфон версия`.
- [x] Подготовлен основной план `PLAN_IOS_VERSION.md` для iPhone-версии приложения ЖК Чайка.
- [x] Исправлены iOS permission-тексты в `app.json`, чтобы не было битой кодировки в системных запросах iOS.
- [x] Добавлены iOS permissions:
  - `NSLocationWhenInUseUsageDescription`
  - `NSMicrophoneUsageDescription`
  - `NSCameraUsageDescription`
  - `NSPhotoLibraryUsageDescription`
  - `NSPhotoLibraryAddUsageDescription`
- [x] Исправлены permission-тексты для плагинов `expo-image-picker` и `expo-av`.
- [x] Добавлен путь к Firebase iOS-файлу:
  - `app.json`: `ios.googleServicesFile`
  - `app.config.js`: `ios.googleServicesFile`
- [x] В `eas.json` добавлены iOS-профили сборки:
  - `ios-simulator`
  - `ios-preview`
  - `ios-production`
- [x] В `eas.json` добавлена секция submit для `ios-production`.
- [x] В `src/firebase-config.ts` добавлен guard: `GoogleSignin.hasPlayServices()` вызывается только на Android.
- [x] В `src/components/ForceUpdateScreen.tsx` iOS больше не ведет пользователя на APK-обновление.
- [x] В `src/screens/AppVersionInfoScreen.tsx` кнопка APK-загрузки скрыта на iOS.
- [x] В `src/screens/Ekran-Koda-Zagruzki.tsx` Google Play скрыт на iOS, App Store скрыт на Android.
- [x] В `src/screens/Profil-Polzovatelya.tsx` добавлен пункт запроса удаления аккаунта через поддержку.
- [x] В `src/components/ContentComplaintModal.tsx` очищены тексты жалоб на контент.
- [x] В `src/components/ReportBlockMenu.tsx` очищены тексты жалобы/блокировки пользователя.
- [x] В `src/screens/Nalashtuvannya-Spovishchen.tsx` очищены тексты экрана настроек уведомлений.
- [x] После изменений запускался `npm run type-check` - успешно.
- [x] Дополнена iOS-секция `app.json`: `buildNumber`, `UIBackgroundModes: remote-notification`, `usesNonExemptEncryption: false`.
- [x] Проверено: `GoogleService-Info.plist` пока отсутствует в корне проекта, его нужно скачать из Firebase вручную.
- [x] На экране входа убрана iOS-рискованная подсказка, где Facebook был привязан к Google Play Services.
- [x] После этих безопасных изменений снова запускался `npm run type-check` - успешно.
- [x] Подготовлен `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` в `app.config.js` для отдельного iOS Google client id.
- [x] `src/firebase-core.ts` теперь передает `iosClientId` в Google Sign-In на iOS, если он задан.
- [x] Экран настроек уведомлений больше не делает лишний повторный Expo permission request перед регистрацией FCM token.
- [x] FCM token registration на iOS вызывает `registerDeviceForRemoteMessages`, если метод доступен.
- [x] После второго блока безопасных изменений запускался `npm run type-check` - успешно.

## Важно: что не трогали

- [x] Не создавались новые Firebase/security rules.
- [x] Не трогалась система загрузки фото.
- [x] Не менялись админские security/auth-файлы:
  - `admin-panel/src/services/authService.ts`
  - `admin-panel/src/firebase/firebase.ts`
  - `firebase.rules.json`
- [x] Не менялась логика `VITE_ADMIN_SERVICE_EMAIL`.
- [x] Не менялись проверки ролей `admin` / `moderator`.

## Что уже снижает риск отказа App Store

- [x] Убраны битые permission-тексты, которые могли выглядеть некорректно в iOS permission dialogs.
- [x] Добавлены недостающие photo library permissions.
- [x] APK-логика больше не показывается пользователю на iOS.
- [x] Google Play больше не показывается на iOS-экране загрузки приложения.
- [x] Добавлен пользовательский путь для запроса удаления аккаунта.
- [x] Жалобы/блокировки пользователей и контента имеют нормальные тексты.
- [x] Базовые iOS EAS-профили добавлены.

## Осталось сделать вручную

- [ ] Зарегистрировать или проверить Apple Developer Program.
- [ ] Создать App ID / Bundle ID: `com.chaikaua.mobile`.
- [ ] Включить capability `Push Notifications`.
- [ ] Включить capability `Sign In with Apple`.
- [ ] Создать iOS-приложение в Firebase с тем же Bundle ID.
- [ ] Скачать `GoogleService-Info.plist`.
- [ ] Положить `GoogleService-Info.plist` в корень проекта.
- [ ] Создать APNs Auth Key в Apple Developer.
- [ ] Загрузить APNs key в Firebase Cloud Messaging.
- [ ] Включить Apple provider в Firebase Authentication.
- [ ] Подготовить Privacy Policy URL.
- [ ] Подготовить Support URL.
- [ ] Подготовить App Store Connect metadata.
- [ ] Подготовить App Review notes.
- [ ] Подготовить тестовый аккаунт для Apple Review.
- [ ] Подготовить скриншоты для App Store.
- [ ] Заполнить App Privacy labels в App Store Connect.
- [ ] Проверить, нет ли платных цифровых функций, которые требуют Apple In-App Purchase.

## Осталось сделать в коде или аудите

- [ ] Провести финальный аудит Apple Sign-In:
  - `src/screens/Vkhod.tsx`
  - `src/firebase-config.ts`
- [ ] Проверить Google Sign-In для iOS:
  - iOS client id
  - reversed URL scheme
  - наличие корректного `GoogleService-Info.plist`
- [ ] Проверить push notification flow на iPhone.
- [ ] Проверить, нет ли двойного запроса permission для уведомлений.
- [ ] Проверить все `BackHandler`-использования.
- [ ] Отдельно решить риск в `src/photo-module/MyPhotosScreen.tsx`, потому что файл относится к фото-модулю и пока не трогался.
- [ ] Проверить microphone permission UX в голосовых функциях.
- [ ] Проверить, что все экраны с пользовательским контентом имеют жалобу/блокировку.
- [ ] Проверить реальные iOS permission prompts на физическом iPhone.
- [ ] Проверить SafeArea/keyboard поведение на iPhone.
- [ ] Проверить авторизацию, регистрацию, восстановление доступа и выход на iPhone.
- [ ] Проверить удаление/деактивацию аккаунта как пользовательский сценарий.
- [ ] Проверить, что в App Store Review Notes описан процесс жалобы, блокировки и удаления аккаунта.

## Команды для следующего этапа

```bash
npm run type-check
```

```bash
eas build --profile ios-simulator --platform ios
```

```bash
eas build --profile ios-preview --platform ios
```

```bash
eas build --profile ios-production --platform ios
```

## Следующая безопасная задача

Самый безопасный следующий шаг без затрагивания правил и фото-загрузки:

- [ ] Аудит и правка Google Sign-In / Apple Sign-In конфигурации для iOS.

Следующий шаг с осторожностью:

- [ ] Аудит `BackHandler`, но `src/photo-module/MyPhotosScreen.tsx` не менять без отдельного подтверждения, потому что пользователь попросил не трогать систему загрузки фото.


