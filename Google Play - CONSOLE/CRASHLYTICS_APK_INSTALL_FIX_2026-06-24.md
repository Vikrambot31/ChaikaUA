# Исправление APK: Crashlytics build ID missing — 24 июня 2026

## Проблема

Последняя APK-сборка устанавливалась/запускалась некорректно на Android. На телефоне появлялся системный экран "Отправить отчет" со stack trace.

Ключевая ошибка со скриншота:

```text
java.lang.RuntimeException: Unable to get provider com.google.firebase.provider.FirebaseInitProvider
Caused by: java.lang.IllegalStateException: The Crashlytics build ID is missing.
This occurs when the Crashlytics Gradle plugin is missing from your app's build configuration.
```

## Корневая причина

В проекте подключены пакеты Firebase:

- `@react-native-firebase/app`
- `@react-native-firebase/crashlytics`
- `@react-native-firebase/messaging`

Но в Android Gradle-конфигурации был подключен только Google Services plugin:

```gradle
apply plugin: 'com.google.gms.google-services'
```

Crashlytics Gradle plugin отсутствовал, поэтому при release-сборке не создавался Crashlytics build ID. Из-за этого Firebase падал уже на этапе `FirebaseInitProvider`, то есть до нормального запуска приложения.

Это выглядело как проблема установки или как предупреждение Android об опасном приложении, но фактически это был native crash при старте приложения.

## Что сделано

### 1. Добавлен постоянный Expo config plugin

Файл:

```text
app.config.js
```

Добавлен helper `withFirebaseCrashlyticsGradle`, который при `expo prebuild` автоматически добавляет:

В `android/build.gradle`:

```gradle
classpath 'com.google.firebase:firebase-crashlytics-gradle:2.9.9'
```

В `android/app/build.gradle`:

```gradle
apply plugin: 'com.google.firebase.crashlytics'
```

Важно: это сделано именно через `app.config.js`, чтобы будущий `expo prebuild --clean` не стер исправление.

### 2. Исправлена текущая локальная Android-сборка

Так как папка `android/` уже была сгенерирована, те же строки были добавлены и в текущие локальные Gradle-файлы:

```text
android/build.gradle
android/app/build.gradle
```

### 3. Пересобран release APK

Команда проверки/сборки:

```bash
cd android
./gradlew :app:assembleRelease --no-daemon
```

Результат:

```text
BUILD SUCCESSFUL
```

В логе сборки появилась нужная задача Crashlytics:

```text
:app:injectCrashlyticsMappingFileIdRelease
```

Это подтверждает, что Crashlytics build ID теперь внедряется в APK.

## Новый APK

Основной файл для установки на телефон:

```text
C:\ChaikaUA\mobile-app-short\release\ChaikaLife-v1.1.449-2026-06-24_07-44-crashlytics-fix.apk
```

Также обновлены копии:

```text
C:\ChaikaUA\mobile-app-short\release\app-release.apk
C:\ChaikaUA\mobile-app-short\ЗАПУСК АПК\app-release.apk
C:\ChaikaUA\mobile-app-short\android\app\build\outputs\apk\release\app-release.apk
```

Размер APK:

```text
104424736 bytes
```

## Проверка подписи

Проверка через `keytool` показала правильный production SHA1:

```text
SHA1: 6E:E5:50:16:9B:D6:51:4B:7B:E6:F4:9E:84:83:BA:89:F6:FF:CB:52
SHA256: 26:F6:E4:02:EE:81:22:8E:08:CF:29:53:81:66:B8:5C:F7:FA:84:F9:0F:BC:2B:C0:73:DE:EF:91:57:B4:31:3C
```

Подпись совпадает с production keystore, который ранее использовался для Google Play.

## Если APK все равно не ставится

1. Полностью удалить старую Chaika Life с телефона.
2. Установить новый файл:

```text
ChaikaLife-v1.1.449-2026-06-24_07-44-crashlytics-fix.apk
```

3. Если Android показывает предупреждение Play Protect, выбрать установку все равно. Для APK, установленного вручную вне Google Play, это может быть обычное предупреждение.
4. Если снова появится экран "Отправить отчет", сделать скрин первого блока с `Caused by:` — это будет уже новая ошибка, не Crashlytics build ID.

## Вывод

Проблема была не в AAB/APK как файле и не в Google Play. APK падал при запуске из-за отсутствующего Crashlytics Gradle plugin. Исправление добавлено в `app.config.js`, текущий Android Gradle-проект обновлен, новый APK v1.1.449 успешно собран и подписан production-ключом.
