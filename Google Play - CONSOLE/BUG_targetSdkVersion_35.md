# BUG: targetSdkVersion должен быть >= 35

## Суть ошибки

Google Play отклоняет AAB/APK с `targetSdkVersion = 34`.
**Требование:** targetSdkVersion >= 35 (обязательно с августа 2025).

## Где настраивается

В Expo managed workflow SDK версии задаются через плагин `expo-build-properties` в `app.config.js`:

```javascript
['expo-build-properties', {
  android: {
    compileSdkVersion: 35,
    targetSdkVersion: 35,
    // НЕ указывать buildToolsVersion — на EAS SDK 50 env нет 35.0.0
  },
}],
```

**НЕ** менять напрямую в `android/build.gradle` — этот файл генерируется Prebuild и будет перезаписан.

## Как проверить

```bash
# После prebuild — проверить gradle.properties
npx expo prebuild --platform android --clean
grep targetSdkVersion android/gradle.properties
# Должно быть: android.targetSdkVersion=35
```

## История

| Дата | Версия | Проблема | Решение |
|------|--------|----------|---------|
| 2026-06-21 | 1.1.437 | targetSdkVersion=34, Google отклонил | Попытка через build.gradle напрямую — неверный подход |
| 2026-06-22 | 1.1.434 | targetSdkVersion=34, Google отклонил | Установлен expo-build-properties ~0.11.1 с compileSdk=35, targetSdk=35 |
| 2026-06-22 | 1.1.435 | buildToolsVersion=35.0.0 не найден на EAS | Убран buildToolsVersion из конфига |

## Важно помнить

1. **Всегда проверять targetSdkVersion перед загрузкой в Play Console**
2. **Не указывать buildToolsVersion** в expo-build-properties — EAS сам подберёт
3. **Expo SDK 50 по умолчанию ставит targetSdk=34** — нужно явно переопределять через плагин
4. **При обновлении Expo SDK** — проверить что targetSdk >= 35 сохранился
