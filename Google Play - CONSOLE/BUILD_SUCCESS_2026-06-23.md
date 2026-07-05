# Успешная сборка v1.1.445 — Отчёт об ошибках и решениях

**Дата:** 2026-06-23
**Версия:** 1.1.445 (код версии: 445)
**Статус:** ✅ BUILD SUCCESSFUL (локальная сборка Gradle)
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab` (64 MB)
**SHA1 подпись:** `6E:E5:50:16:9B:D6:51:4B:7B:E6:F4:9E:84:83:BA:89:F6:FF:CB:52`

---

## Хронология ошибок и решений

### Ошибка 1: Kotlin компиляция с compileSdk 35
**Версия:** 1.1.435–1.1.437
**Статус:** 🔴 EAS Build FAILED (все 3 попытки)

#### Проблема
```
expo-modules-core:compileReleaseKotlin
PermissionsService.kt:166:36 — Only safe (?.) or non-null asserted (!!.)
calls are allowed on a nullable receiver of type Array<(out) String!>?
```

#### Корневая причина
- Google Play требует `compileSdkVersion >= 35` (с августа 2025)
- Android SDK 35 добавил явные `@Nullable` аннотации к `PackageInfo.requestedPermissions`
- `expo-modules-core@1.11.14` не готов к null-safety в Kotlin при SDK 35
- Оригинальный код из npm: `return requestedPermissions.contains(permission)` (без `?.)
- С SDK 35 это вызывает Kotlin ошибку null-safety

#### Решение
Создан постинсталл патч `scripts/patch-expo-permissions-sdk35.js`:
```kotlin
// БЫЛО:
return requestedPermissions.contains(permission)

// СТАЛО:
return requestedPermissions?.toList()?.contains(permission) ?: false
```

**Почему это работает:**
- `requestedPermissions?.toList()` возвращает `List<String>?` (nullable)
- `List.contains()` корректно обрабатывает null-safe цепи
- `?: false` возвращает false если null (безопасно)

**Ошибка в первой попытке патча:**
- Искал `return requestedPermissions?.contains(permission) == true`
- Но npm-пакет содержит просто `return requestedPermissions.contains(permission)`
- Без `== true`, без `?.` префикса
- Фиксить нужно правильный паттерн

**Финальный патч:**
- Проверяет все 3 известных варианта
- При неудаче выводит реальное содержимое файла + exit code 1
- Идемпотентен (повторный запуск пропускает уже запатченный файл)

---

### Ошибка 2: Истечение лимита бесплатных билдов EAS
**Версия:** 1.1.438
**Статус:** 🟡 EAS Build QUEUED → ERROR (Free tier limit exhausted)

#### Проблема
```
This account has used its Android builds from the Free plan this month,
which will reset in 7 days (on Wed Jul 01 2026).
Upgrade your plan for more builds...
```

#### Корневая причина
- EAS Free tier имеет лимит на количество билдов в месяц
- Каждый неудачный билд расходует лимит (даже если упал)
- 5 попыток (435–437 на EAS, 438 начал загружаться) = лимит исчерпан
- Следующий билд требует upgrade плана или ждать 1 июля

#### Решение
**Переход на локальную сборку через Gradle:**
1. `npx expo prebuild --platform android --clean` — генерирует Android native проект
2. `cd android && ./gradlew bundleRelease` — локальная сборка AAB
3. Занимает ~10 минут локально (вместо ~20 минут в облаке)
4. Полностью бесплатно, без лимитов

**Преимущества локальной сборки:**
- Нет облачных лимитов
- Нет зависимости от интернета (после первого prebuild)
- Можно собирать столько раз, сколько нужно
- Мгновенная диагностика ошибок в логах

---

### Ошибка 3: Неправильная подпись в локальной сборке
**Версия:** 1.1.438 (первая локальная попытка)
**Статус:** 🔴 Google Play REJECTED

#### Проблема
Google Play отклонил AAB с ошибкой:
```
Код версии 438 уже использован. Попробуйте другой.
Набор Android App Bundle подписан с помощью неправильного ключа.
Выберите правильный ключ и повторите попытку.
```

**На скриншоте видны 2 ошибки:**
```
❌ application-37a217e6-fb4d-450c-8960-d315042e090e.aab
   SHA1: 6E:E5:50:16:9B:D6:51:4B:7B:E6:F4:CB:52

❌ app-release.aab
   SHA1: ??? (неверный)
```

#### Корневая причина
Локальная сборка использовала **debug keystore** вместо **production keystore**:
- `android/app/build.gradle` имел `signingConfig signingConfigs.debug` для release
- Debug ключ (от Android Studio) != Production ключ (от Google Play)
- EAS хранит production keystore в облаке, локально его не было

#### Решение

**1. Получить production keystore с EAS через GraphQL API:**
```bash
curl -X POST https://api.expo.dev/graphql \
  -H "expo-session: ..." \
  -d '{"query":"{ app { byFullName(...) {
    androidAppCredentials {
      androidAppBuildCredentialsList {
        androidKeystore {
          keystore, keystorePassword, keyAlias, keyPassword,
          sha1CertificateFingerprint
        }
      }
    }
  } } }"}'
```

**2. Сохранить base64-закодированный keystore:**
```python
import base64
with open('production.keystore', 'wb') as f:
    f.write(base64.b64decode(keystore_b64))
```

**3. Обновить `android/app/build.gradle`:**
```gradle
signingConfigs {
    release {
        storeFile file('../../production.keystore')
        storePassword '200e9fc2ba2b6b96d61eb3d8e38bd165'
        keyAlias 'e3f971155cc801095f743d1e20a39f2c'
        keyPassword '19354b86ed0f2699f2547daed02d9701'
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release  // ← было signingConfigs.debug
    }
}
```

**4. Пересобрать:**
```bash
./gradlew bundleRelease
```

**5. Верифицировать SHA1:**
```bash
keytool -printcert -jarfile app-release.aab | grep SHA1
# SHA1: 6E:E5:50:16:9B:D6:51:4B:7B:E6:F4:9E:84:83:BA:89:F6:FF:CB:52 ✅
```

---

### Ошибка 4: Конфликт кодов версий
**Статус:** 🔴 Google Play REJECTED (версия уже использована)

#### Проблема
```
Код версии 438 уже использован.
```

Каждый загруженный (даже не опубликованный) AAB резервирует код версии.

#### Корневая причина
- v1.1.435: EAS загрузил в Google Play (2 попытки упали на сборке, но кода зарезервирован)
- v1.1.436: Бампили вручную
- v1.1.437: Автоматический bump при проблеме с номером версии
- v1.1.438: Первая локальная сборка (с неверной подписью)
- Все коды 435–438 уже "заняты" в Google Play

#### Решение
**Прыгнуть через несколько версий:**
- v1.1.445 — достаточный запас (7 версий), чтобы избежать конфликта
- Если потом понадобится пересобрать — идём на 446, 447 и т.д.

**Почему это нормально:**
- Google Play хранит все версии (для отката)
- Номера версий не обязаны быть последовательными
- Можно выпускать 1.1.435 → 1.1.450 → 1.1.452 (пропуски OK)

---

## Как не повторить эти ошибки

### 1️⃣ Kotlin null-safety с SDK 35+
**Что делать:**
- При переходе на `compileSdkVersion >= 35` проверить все null-unsafe вызовы
- Для expo-modules-core — применить патч `patch-expo-permissions-sdk35.js`
- Если другие пакеты ломаются — создать аналогичные постинсталл патчи
- Тестировать локально: `npx expo prebuild && ./gradlew bundleRelease`

### 2️⃣ Лимиты облачных сервисов
**Что делать:**
- Для разработки и тестирования — локальная сборка (Gradle)
- EAS использовать только для финальных production builds (или если нужны разные конфиги)
- Локально: быстрее, бесплатно, полные логи ошибок

### 3️⃣ Production keystore
**Что делать:**
- **НИКОГДА** не коммитить keystore в репозиторий
- Хранить в EAS (облако) или отдельном защищённом месте
- Если нужен локально — скачать через EAS GraphQL API (как сейчас)
- При обновлении build.gradle — сразу указать правильный стoreFile

### 4️⃣ Коды версий
**Что делать:**
- После каждого неудачного билда — бампить версию (`npm version patch`)
- Или использовать большие скачки (444 → 450) при частых ошибках
- Проверить код версии перед загрузкой: `grep versionCode app.json`

---

## Успешная сборка — итоги

| Этап | Результат |
|------|-----------|
| Kotlin компиляция | ✅ PASSED (с патчем) |
| Локальный Gradle build | ✅ 55 sec (2м 4м попытка) |
| Подпись AAB | ✅ SHA1 совпадает |
| Размер файла | ✅ 64 MB (нормально) |
| Готовность к Google Play | ✅ Версия 445, подпись верна |

---

## Команды для быстрой сборки в будущем

```bash
# Один раз (первая сборка)
npx expo prebuild --platform android --clean
cd android

# Все последующие разы
./gradlew bundleRelease --no-daemon

# AAB готов в:
# android/app/build/outputs/bundle/release/app-release.aab
```

---

## Файлы которые менялись

```
scripts/
├── patch-expo-permissions-sdk35.js (НОВЫЙ — постинсталл патч)

app.json
├── "version": "1.1.445"
├── "versionCode": 445

package.json
├── "version": "1.1.445"
├── postinstall: + patch-expo-permissions-sdk35.js

android/app/build.gradle
├── signingConfigs.release { ... production keystore ... }
├── buildTypes.release { signingConfig signingConfigs.release }

production.keystore (НОВЫЙ — скачан с EAS, не коммитится)
```

---

## Выводы

1. **Kotlin null-safety с SDK 35** — не ошибка в коде, ошибка в upstream (expo-modules-core). Патчить нужно постинсталл-скриптом.

2. **EAS лимиты** — реальная проблема при разработке. Для разработки = локальная сборка. Для CI/CD = облако.

3. **Production keystore** — всегда хранить в EAS, скачивать через API когда нужен локально.

4. **Коды версий** — после ошибок = бампить версию. Не переживать о пропусках (435 → 438 → 445 OK).

**Следующая сборка:** просто `./gradlew bundleRelease` + бампить версию в package.json + app.json.

