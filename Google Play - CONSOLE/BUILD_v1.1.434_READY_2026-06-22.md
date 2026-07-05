# Google Play Release: Build v1.1.434 Ready - 22 июня 2026

## Что сделано

### Решены 4 критических блокера EAS build

| Проблема | Решение | Статус |
|----------|---------|--------|
| WebP-иконки не поддерживались Jimp | Все `.webp` заменены на `.png` в `app.json` для icon, splash и adaptiveIcon | OK |
| `google-services.json` отсутствовал | Файл скачан через Firebase CLI и добавлен в корень проекта | OK |
| EAS env vars для Facebook SDK не были установлены | Добавлены нужные production secrets для Facebook и Firebase | OK |
| FCM manifest merger conflict | Добавлен `withAndroidManifest` plugin с `tools:replace` для решения конфликта | OK |

### Версионирование

- Версия поднята: `1.1.433` -> `1.1.434`
- `versionCode`: `433` -> `434`
- Build date: `2026-06-22`

### Проверка качества

- Prebuild успешно прошел локально.
- Gradle `bundleRelease` успешно прошел локально.
- EAS production build успешно создал AAB-артефакт.

---

## AAB-артефакт

```text
Ссылка:  https://expo.dev/artifacts/eas/t_DAxJh6pWiVjRVg9jKbumqv9kyA41YH7_OtfhjNVXg.aab
Версия:  1.1.434
Тип:     Android App Bundle (AAB) для Google Play
Профиль: production
Статус:  BUILD SUCCESSFUL
```

---

## Следующие шаги публикации

### Internal Testing

1. Загрузить актуальный AAB в Google Play Console -> Internal Testing.
2. Заполнить release notes.
3. Заполнить Content Rating questionnaire.
4. Проверить App Signing.

### Closed Testing

1. Добавить 20+ тестеров с Google-аккаунтами.
2. Выпустить сборку в Closed Testing.
3. Собрать обратную связь и проверить стабильность.
4. Следить за crash rate в Crashlytics.

### Production

1. Загрузить актуальный AAB в Production.
2. Заполнить Store Listing:
   - описание приложения;
   - скриншоты;
   - preview video при наличии;
   - иконка приложения 1024x1024;
   - feature graphic 1024x500.
3. Установить цену и регионы распространения.
4. Отправить на review.

---

## Что было исправлено в коде

### `app.json`

```json
{
  "icon": "./assets/Logo-Chaika LIFE-box.png",
  "splash": { "image": "./assets/logo-8.png" },
  "android": {
    "icon": "./assets/Logo-Chaika LIFE-box.png",
    "adaptiveIcon": {
      "foregroundImage": "./assets/Logo-Chaika LIFE-box.png",
      "monochromeImage": "./assets/Logo-Chaika LIFE-box.png"
    },
    "googleServicesFile": "./google-services.json"
  }
}
```

### `app.config.js`

Добавлен `withFcmManifestFix`, который решает конфликт между `react-native-firebase_messaging` и `expo-notifications` по `default_notification_color`.

### `.easignore`

```text
android/
```

Локальная папка `android/` исключена из EAS-архива, чтобы EAS Prebuild генерировал native-проект сам.

### `scripts/bump-release-version.cjs`

Скрипт обновлен так, чтобы корректно работать с managed workflow и проверять наличие `android/app/build.gradle` перед редактированием.

---

## Статус относительно первоначального аудита

| Критерий | Было | Сейчас | Прогресс |
|----------|------|--------|----------|
| APK/AAB сборка | Падала | SUCCESS | 100% |
| `google-services.json` | Missing | Present | 100% |
| Firebase переменные в EAS | Нет | Добавлены | 100% |
| Иконки в правильном формате | WebP | PNG | 100% |
| Manifest conflicts | Error | Resolved | 100% |

---

## Быстрая шпаргалка

```text
1. Поддерживать актуальную версию приложения и versionCode.
2. Собирать fresh AAB/APK перед публикацией.
3. Загружать сборку в Internal Testing.
4. Переходить в Closed Testing после базовой проверки.
5. Отправлять в Production после стабильного теста.
```

---

## Важные ссылки

| Сервис | Ссылка | Назначение |
|--------|--------|------------|
| Firebase Console | https://console.firebase.google.com/project/chaikaua-3cd9d | Firebase-конфигурация |
| Play Console | https://play.google.com/console | Загрузка AAB и управление версиями |
| EAS Build Logs | https://expo.dev/accounts/vikram2027/projects/chaika-ua/builds | История сборок |

---

## Метаданные

- Дата отчета: 22 июня 2026
- Версия приложения: `1.1.434`
- SDK: Expo 50.0.0, React Native 0.73
- EAS profile: `production`
- Git branch: `codex/registration-avatar-flow`
- Последний commit: `e843e59` - Fix FCM manifest merger
