# Google Play Release: Build v1.1.434 Ready — 22 июня 2026

## ✅ Что сделано сегодня

### Решены 4 критических блокера EAS build

| Проблема | Решение | Статус |
|----------|---------|--------|
| **WebP иконки не поддерживаются Jimp** | Заменены все .webp на .png в app.json (icon, splash, adaptiveIcon) | ✅ |
| **google-services.json отсутствовал** | Скачан через Firebase CLI, добавлен в корень проекта | ✅ |
| **EAS env vars для Facebook SDK не установлены** | Добавлены все 11 vars в EAS production secrets (FB, Firebase) | ✅ |
| **FCM manifest merger конфликт** | Добавлен withAndroidManifest плагин с tools:replace для разрешения конфликта | ✅ |

### Версионирование

- Версия поднята: **1.1.433 → 1.1.434** (4 коммита)
- versionCode: **433 → 434**
- Build date: 2026-06-22

### Проверка качества

- ✅ Prebuild успешен локально (Expo managed workflow)
- ✅ Gradle bundleRelease успешен локально (3m 23s, BUILD SUCCESSFUL)
- ✅ EAS production build успешен (AAB артефакт создан)

---

## 📦 AAB Артефакт готов

```
Ссылка:  https://expo.dev/artifacts/eas/t_DAxJh6pWiVjRVg9jKbumqv9kyA41YH7_OtfhjNVXg.aab
Версия:  1.1.434
Тип:     Android App Bundle (AAB) для Google Play
Профиль: production
Статус:  ✅ BUILD SUCCESSFUL
```

---

## ⏳ Текущие блокеры для публикации

### 1. 🔴 КРИТИЧЕСКИЙ — Аккаунт Google Play заблокирован

**Статус:** Апелляция подана 21 июня
**Дело:** 6-4165000041014
**Сроки:** 3–7 рабочих дней (до ~26-28 июня)

**Что произошло:**
- Google KYC автоматика отклонила верификацию личности
- Причина: несоответствие транслитерации имени в Google Payments
  - Google Accounts: `Ihor Volynets` ✅
  - Google Payments: `Волинець Ігор Ігоревич` (старое написание)
  - Международный паспорт: `IHOR VOLYNETS` ✅

**Что ожидаем:**
1. Google Payments одобрит смену имени (до 5 раб. дней) → письмо на vikramsave@ukr.net
2. После этого нужно пройти верификацию личности заново в Play Console
3. Потом подтвердить телефон +380509000127 (SMS или дзвінок)

**Действие:** Проверьте email vikramsave@ukr.net на письма от:
- `payments-noreply@google.com` (смена имени в Payments)
- `googleplay-developer-support@google.com` (ответ на апеляль)

---

## 📋 Предстоящие шаги после разблокирования

### Шаг 1 — Загрузить AAB в Internal Testing (2–3 часа)
```bash
# В Google Play Console → Версии → Internal Testing
1. Загрузить AAB v1.1.434
2. Заполнить Release Notes (на украинском)
3. Заполнить рейтинг контента (Content rating questionnaire)
4. Проверить App Signing (Google Play заподписывает автоматически)
```

### Шаг 2 — Миграция в Closed Testing (14+ дней, 20+ тестеров)
```bash
# В Play Console → Версии → Closed Testing
1. Добавить 20+ тестеров (email их Google аккаунтов)
2. Выпустить v1.1.434 в Closed Testing
3. Ждать 14 дней feedback и стабильности
4. Внимательно следить за Crash Rate (Crashlytics)
```

**Рекомендуемые тестеры:**
- Ваши знакомые / коллеги (минимум 15 человек)
- Ботаккаунты (если есть)
- Внутренняя команда

### Шаг 3 — Миграция в Production (Открытый доступ)
```bash
# В Play Console → Версии → Production
1. Перезагрузить AAB v1.1.434 в Production
2. Заполнить Store Listing:
   - Описание приложения
   - Скриншоты (мин. 2, макс. 8)
   - Превью видео
   - Иконка приложения (1024x1024)
   - Feature graphic (1024x500)
3. Установить цену (бесплатно или платно)
4. Выбрать регионы распространения
5. Отправить на Review (Google рассмотрит за 1–3 часа)
```

---

## 🛠️ Что было исправлено в коде

### app.json
```json
{
  "icon": "./assets/Logo-Chaika LIFE-box.png",  // было: .webp
  "splash": { "image": "./assets/logo-8.png" }, // было: .webp
  "android": {
    "icon": "./assets/Logo-Chaika LIFE-box.png",
    "adaptiveIcon": {
      "foregroundImage": "./assets/Logo-Chaika LIFE-box.png",
      "monochromeImage": "./assets/Logo-Chaika LIFE-box.png"
    },
    "googleServicesFile": "./google-services.json"  // было: ./android/app/google-services.json
  }
}
```

### app.config.js
```javascript
// Добавлен withFcmManifestFix плагин
const withFcmManifestFix = (config) => {
  return withAndroidManifest(config, (androidConfig) => {
    // Решает конфликт между react-native-firebase_messaging
    // и expo-notifications (оба определяют default_notification_color)
    // Добавляет tools:replace="android:resource" к meta-data элементу
  });
};
```

### .easignore
```
# Исключить локальную папку android/ из архива
# EAS Prebuild сама сгенерирует нужную версию
android/
```

### scripts/bump-release-version.cjs
```javascript
// Исправлена обработка android/app/build.gradle
// В managed workflow этот файл генерируется динамически
// Теперь скрипт проверяет его наличие перед редактированием
```

---

## 📊 Статус относительно изначального аудита

| Критерий | Было | Сейчас | Прогресс |
|----------|------|--------|----------|
| APK/AAB сборка | ❌ Падает | ✅ SUCCESS | 100% |
| google-services.json | ❌ MISSING | ✅ PRESENT | 100% |
| Firebase переменные в EAS | ❌ НЕТ | ✅ 11 vars | 100% |
| Иконки в правильном формате | ⚠️ WebP | ✅ PNG | 100% |
| Manifest конфликты | ❌ ERROR | ✅ RESOLVED | 100% |
| Аккаунт разработчика | 🔴 BLOCKED | 🔴 BLOCKED (апеляль) | 0% (ждем Google) |

---

## 🚀 Быстрая шпаргалка: Следующие действия

```bash
# День 1-2 (сейчас)
✅ Build v1.1.434 готов к загрузке
✅ Коды исправлены и закоммичены
🔄 Ждете письмо от Google Payments / Play Console

# День 3-8 (после разблокирования)
⏳ Внутренняя тестирование (Internal Testing)
⏳ Закрытое тестирование (Closed Testing, 14 дней)

# День 22+
⏳ Production Review (Google рассмотрит 1-3 часа)
⏳ Публикация в открытый доступ
```

---

## 📞 Важные контакты и ссылки

| Сервис | Контакт | Назначение |
|--------|---------|-----------|
| Google Play Support | googleplay-developer-support@google.com | Ответ на апеляль (дело 6-4165000041014) |
| Google Payments | payments-noreply@google.com | Смена имени в Payments профиле |
| Firebase Console | https://console.firebase.google.com/project/chaikaua-3cd9d | Скачивание google-services.json |
| Play Console | https://play.google.com/console | Загрузка AAB и управление версиями |
| EAS Build Logs | https://expo.dev/accounts/vikram2027/projects/chaika-ua/builds | История сборок |

---

## 📝 Версия и метаданные

- **Дата отчета:** 22 июня 2026, 11:52 UTC+2
- **Версия приложения:** 1.1.434
- **SDK:** Expo 50.0.0, React Native 0.73
- **Профиль EAS:** production (AAB для Google Play)
- **Ветка git:** codex/registration-avatar-flow
- **Последний коммит:** e843e59 (Fix FCM manifest merger)

