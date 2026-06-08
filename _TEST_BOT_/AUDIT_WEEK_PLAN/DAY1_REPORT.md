# ЗВІТ ЗА ДЕНЬ 1: АУТЕНТИФІКАЦІЯ, РЕЄСТРАЦІЯ, ONBOARDING

## Дата: 2026-06-08
## Агент: DeepSeek v4
## Статус: Перевірено 10 з 10 задач

---

## СТАТИСТИКА

- **Перевірено файлів:** ~43
- **Знайдено багів:** 20
  - **CRITICAL:** 0
  - **HIGH:** 2
  - **MEDIUM:** 17
  - **LOW:** 1

---

## ЗНАЙДЕНІ БАГИ

---

### BUG-1.1.1: Race condition — версія не блокує онбординг [HIGH]

- **Severity:** HIGH
- **Файл:** `App.tsx`
- **Строка:** 685-698
- **Функція:** `App()`
- **Проблема:** Сплаш зникає після першого ж завершеного ініт-кроку. Якщо `isCheckingVersion` ще true, `versionCheck` = null → `?.requiresUpdate` = undefined → ForceUpdateScreen не показується. Користувач бачить онбординг, хоча може бути доступна версія з forced update.
- **Код:**
```typescript
{showSplash || isCheckingFirstLaunch || isPreparingStartupImages || isCheckingVersion || isLoadingRemoteConfig ? (
  <SplashAnimation onFinish={() => setShowSplash(false)} />
) : versionCheck?.requiresUpdate ? (
  <ForceUpdateScreen ... />
) : showOnboarding && !showLanguagePicker ? (
  <FirstLaunchOnboarding onDone={handleOnboardingDone} />
```
- **Очікуване поведінка:** ForceUpdateScreen має блокувати будь-який інший UI, поки перевірка версії не завершиться
- **Фактичне поведінка:** Онбординг показується до завершення перевірки версії
- **Як відтворити:** Завантажити стару версію → відкрити → сплеш швидко зникає → онбординг
- **Рекомендація:** Обгорнути `isCheckingVersion` у додаткове блокування, або перенести ForceUpdateScreen у `AppWithAuthSync`

---

### BUG-1.1.2: SplashAnimation без timeout для відео [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/components/SplashAnimation.tsx`
- **Строка:** 14-19, 24-37
- **Функція:** `SplashAnimation`
- **Проблема:** Якщо відео не завантажилось (на Web), `onPlaybackStatusUpdate` з `didJustFinish` ніколи не спрацює. `handleFinish` не викличеться — сплеш зависне назавжди.
- **Код:**
```typescript
const handleFinish = () => {
  if (calledRef.current) return;
  calledRef.current = true;
  setVideoVisible(false);
  onFinish?.();
};

// Викликається тільки з onPlaybackStatusUpdate
<Video source={require('../../assets/video-Logo2.mp4')}
  onPlaybackStatusUpdate={(status) => {
    if (status.isLoaded && status.didJustFinish) { handleFinish(); }
  }} />
```
- **Очікуване поведінка:** Якщо відео не завантажилось за N секунд, сплеш має завершитись через timeout
- **Фактичне поведінка:** Сплеш висить назавжди
- **Як відтворити:** Відкрити на Web → сплеш не зникає
- **Рекомендація:** Додати `setTimeout` з fallback на `handleFinish` через 5-10 секунд

---

### BUG-1.2.1: OnboardingSlides — свайп між слайдами не працює [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/components/OnboardingSlides.tsx`
- **Строка:** 174
- **Функція:** `OnboardingSlides`
- **Проблема:** FlatList має `scrollEnabled={false}`, тому свайп вимкнено. Користувач може гортати лише кнопками.
- **Код:** `<FlatList ... scrollEnabled={false} horizontal pagingEnabled />`
- **Очікуване поведінка:** Користувач може гортати слайди як свайпом, так і кнопками
- **Фактичне поведінка:** Тільки кнопки "Далі" та точки
- **Рекомендація:** Прибрати `scrollEnabled={false}`

---

### BUG-1.2.2: Англійський текст онбордингу містить російське слово [LOW]

- **Severity:** LOW
- **Файл:** `src/components/FirstLaunchOnboarding.tsx`
- **Строка:** 64
- **Функція:** `FirstLaunchOnboarding`
- **Проблема:** В англійському перекладі залишилось російське слово
- **Код:** `'Find nearby people for chats, meetings and new знакомства'`
- **Очікуване поведінка:** Всі слова англійською
- **Фактичне поведінка:** "знакомства" — російською
- **Рекомендація:** Замінити на "acquaintances" або "connections"

---

### BUG-1.3.1: LanguagePicker скидає мову на UA при mount [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/components/LanguagePickerOnboarding.tsx`
- **Строка:** 49-51
- **Функція:** `LanguagePickerOnboarding`
- **Проблема:** useEffect примусово встановлює UA при кожному монтуванні. Якщо користувач обирав RU/EN, але закрив додаток, при повторному відкритті мова скидається.
- **Код:**
```typescript
useEffect(() => {
  dispatch(setLanguage('ua'));
}, [dispatch]);
```
- **Очікуване поведінка:** Зберігати вибрану мову між сесіями
- **Фактичне поведінка:** При повторному відкритті — знову UA
- **Рекомендація:** Завантажувати збережену мову з Redux/AsyncStorage замість примусового `'ua'`

---

### BUG-1.3.2: Пароль — login каже ≥6, реєстрація вимагає ≥8 + спецсимвол [MEDIUM]

- **Severity:** MEDIUM
- **Файли:** `src/screens/Vkhod.tsx:220` vs `src/utils/validators.ts:37-42`
- **Функції:** `LoginScreen.validatePassword` vs `validatePassword()`
- **Проблема:** Різні вимоги до пароля в логіні та реєстрації.
  - Login: `password.length >= 6`
  - Реєстрація: `>= 8 + letter + digit + special`
- **Код Vkhod:** `const isPasswordValid = password.length >= 6;`
- **Код validators:**
```typescript
export const validatePassword = (password: string): boolean => {
  return password.length >= 8
    && /[A-Za-zА-Яа-яІіЇїЄєҐґ]/u.test(password)
    && /\d/.test(password)
    && /[^A-Za-zА-Яа-яІіЇїЄєҐґ\d]/u.test(password);
};
```
- **Очікуване поведінка:** Однакові вимоги до пароля на всіх екранах
- **Фактичне поведінка:** Login повідомляє "мінімум 6 символів", але зареєструватись з 6-7 символами неможливо
- **Як відтворити:** Спробувати зареєструватись з паролем "abc123" — відхилено. На логіні написано "мінімум 6 символів"
- **Рекомендація:** Узгодити валідацію. Або login має використовувати `validatePassword` з `validators.ts`, або реєстрація має приймати ≥6 без спецсимволу

---

### BUG-1.4.1: Facebook Login — декоративна кнопка, не працює [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Vkhod.tsx`
- **Строка:** 379-384
- **Функція:** `handleFacebookLogin()`
- **Проблема:** Кнопка "Увійти через Facebook" показує тільки Alert, ніколи не ініціює Facebook Login.
- **Код:**
```typescript
const handleFacebookLogin = useCallback(async () => {
  Alert.alert(text.errorLoginTitle,
    'Facebook вхід буде доступний після появи застосунку в Google Play Store. Будь ласка, використовуйте вхід через Email або Google.');
}, [text]);
```
- **Очікуване поведінка:** Кнопка або виконує Facebook Login, або прихована
- **Фактичне поведінка:** Кнопка видима, але не виконує логін
- **Як відтворити:** Натиснути "Увійти через Facebook" → Alert
- **Рекомендація:** Сховати кнопку, поки Facebook Login не налаштовано, або додати прапорець `facebookAvailable`

---

### BUG-1.6.1: validateName не перевіряє "тільки букви" [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/utils/validators.ts`
- **Строка:** 44-46
- **Функція:** `validateName()`
- **Проблема:** Перевіряє лише `length >= 2`. Не фільтрує цифри та спецсимволи. Вимога: "тільки букви".
- **Код:**
```typescript
export const validateName = (name: string): boolean => {
  return name.trim().length >= 2;
};
```
- **Очікуване поведінка:** `validateName("John123")` → false
- **Фактичне поведінка:** `validateName("John123")` → true
- **Як відтворити:** Ввести ім'я "Test1" — валідація проходить
- **Рекомендація:** Додати перевірку `/^[A-Za-zА-Яа-яІіЇїЄєҐґ'\-]+$/`

---

### BUG-1.6.2: Немає inline-повідомлень помилок валідації полів [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Registraciya-Polnaya.tsx`
- **Строка:** 193-324
- **Функція:** `RegisterScreenFull`
- **Проблема:** Користувач не бачить чому поле невалідне. Тільки галочка `completed` зникає. Конкретний текст помилки відсутній. Єдиний `errorText` — для Firebase-помилок (рядок 324).
- **Код:**
```typescript
// Єдиний errorText:
{error ? <Text style={styles.errorText}>{error}</Text> : null}
```
- **Очікуване поведінка:** Під кожним полем текст: "Мінімум 2 символи", "Формат +380..." тощо
- **Фактичне поведінка:** Тільки пропадає галочка на лейблі
- **Рекомендація:** Додати `FormFieldError` аналогічно до `Vkhod.tsx` під кожним полем

---

### BUG-1.6.3: Password onChangeText не очищує auth помилку [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Registraciya-Polnaya.tsx`
- **Строка:** 240-244 vs 199-228
- **Функція:** `RegisterScreenFull`
- **Проблема:** При зміні `name/email/phone` викликається `dispatch(clearError())`. При зміні `password` або `confirmPassword` — ні.
- **Код:**
```typescript
// name (199-201) — очищує:
onChangeText={(text) => { setName(...); if (error) dispatch(clearError()); }}

// password (240-244) — НЕ очищує:
onChangeText={setPassword}
```
- **Як відтворити:** Зареєструватись з зайнятим email → помилка. Змінити пароль → помилка все ще видна.
- **Рекомендація:** Додати `if (error) dispatch(clearError())` у setPassword/setConfirmPassword

---

### BUG-1.6.4: Пароль вимагає недокументований спецсимвол [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/utils/validators.ts`
- **Строка:** 37-42
- **Функція:** `validatePassword()`
- **Проблема:** Валідація вимагає: ≥8 + letter + digit + **special**. План аудиту каже "min 6". Спецсимвол ніде не задокументований.
- **Код:**
```typescript
export const validatePassword = (password: string): boolean => {
  return password.length >= 8
    && /[A-Za-zА-Яа-яІіЇїЄєҐґ]/u.test(password)
    && /\d/.test(password)
    && /[^A-Za-zА-Яа-яІіЇїЄєҐґ\d]/u.test(password);  // <-- special character
};
```
- **Очікуване поведінка:** Вимога до пароля має бути задокументована (мінімум: буква + цифра, або без спецсимволу)
- **Фактичне поведінка:** `abc12345` (8 символів, буква + цифра) не проходить
- **Рекомендація:** Або прибрати вимогу спецсимволу, або додати повідомлення про нього

---

### BUG-1.6.5: Дві різні системи валідації телефону [MEDIUM]

- **Severity:** MEDIUM
- **Файли:** `src/utils/rulesEngine.ts:49-52` vs `src/utils/validationMessages.ts:59-88`
- **Функції:** `validatePhone()`
- **Проблема:** `rulesEngine.ts` вимагає `+380XXXXXXXXX`. `validationMessages.ts` приймає 10-13 цифр без префікса. Форма реєстрації використовує `rulesEngine`. Якщо нормалізація не спрацює, `095...` не пройде.
- **Також:** `validationMessages.ts` (клас `FormValidator`) не використовується в реєстрації — дубльована логіка.
- **Рекомендація:** Узгодити логіку валідації телефону в одному місці

---

### BUG-1.6.6: Орфанний auth-акаунт при невдалій перевірці поручителя [HIGH]

- **Severity:** HIGH
- **Файл:** `src/hooks/useFullRegistration.ts`
- **Строка:** 123-152
- **Функція:** `handleRegister()`
- **Проблема:** Firebase Auth юзер створений (рядок 125), але `delete()` падає (нема мережі). Користувач не може перереєструватись (`auth/email-already-in-use`). Дані в `/users/{uid}` відсутні.
- **Код:**
```typescript
const authUser = isCompletingExistingAccount
  ? auth.currentUser
  : (await createUserWithEmailAndPassword(auth, normalizedEmail, password)).user;
// ...
if (!referrerVerified) {
  if (!isCompletingExistingAccount) {
    try { await authUser.delete(); }
    catch { await signInAnonymously(auth).catch(() => null); } // ← не виправляє
  }
  dispatch(setError(text.referrerNotFound));
  return; // ← акаунт ВЖЕ створений
}
```
- **Рекомендація:** Перевіряти поручителя ДО створення Firebase Auth user. Або використовувати транзакцію.

---

### BUG-1.7.1: Аватар під anonymous uid губиться після реєстрації [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/StartAvatarPickerScreen.tsx`
- **Строка:** 79
- **Функція:** `confirm()`
- **Проблема:** Аватар зберігається під `auth.currentUser?.uid` який може бути anonymous. Після реєстрації створюється новий uid — дані під старим uid стають мертвими.
- **Код:** `const uid = auth.currentUser?.uid || user?.id;`
- **Очікуване поведінка:** Зберігати аватар тільки локально (AsyncStorage) до завершення реєстрації
- **Фактичне поведінка:** В Firebase створюється запис під anonymous uid
- **Рекомендація:** Не писати avatar у Firebase на екрані вибору аватара. Тільки в `useFullRegistration` після створення акаунта.

---

### BUG-1.9.1: Admin бачить flash MaintenanceScreen до перевірки ролі [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/components/AppAccessGuard.tsx`
- **Строка:** 68, 110-134
- **Функція:** `AppAccessGuard`
- **Проблема:** `isPrimaryServiceEmail` на старті може бути `false` (Firebase Auth ще не ініціалізовано). Ефект (рядок 110-134) виправляє це асинхронно. До того — admin бачить сплеш, потім MaintenanceScreen (або ForceUpdate), потім свій контент.
- **Код:**
```typescript
const [isBypassUser, setIsBypassUser] = useState(() => isPrimaryServiceEmail(auth.currentUser));
// ...
if (!isBypassUser) {
  if (!config.app_enabled) { return <MaintenanceScreen />; }
```
- **Рекомендація:** Не показувати блокуючі екрани, поки auth не готовий. Можна показати loading/splash замість MaintenanceScreen.

---

### BUG-1.8.1: "Quick Registration" не зберігає власне фото [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/ProfileSetupScreen.tsx`
- **Строка:** 225-231
- **Функція:** `handleQuickRegistrationPress()`
- **Проблема:** Зберігає тільки `selectedKey` (startAvatar), але ігнорує `customAvatarUri`. Якщо користувач завантажив власне фото і натиснув "Швидка реєстрація" — фото втрачається.
- **Код:**
```typescript
setSaving(true);
try {
  if (selectedKey) await saveSelectedStartAvatar(selectedKey);
  await saveTempProfileData({
    name: trimmedName,
    gender: gender!,
    age: parsedAge,
    startAvatarKey: selectedKey, // ← customAvatarUri не збережено
  });
```
- **Очікувано:** `saveTempProfileData` має також приймати `customAvatarUri` для подальшого завантаження після реєстрації.

---

### BUG-1.8.2: `getMissingMessages` не перевіряє avatar — кнопка Continue мовчки не працює [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/ProfileSetupScreen.tsx`
- **Строка:** 189-195, 197-207
- **Функція:** `getMissingMessages()`, `handleContinuePress()`
- **Проблема:** Функція перевіряє тільки name/gender/age, але НЕ avatar (`text.missingAvatar` існує в словнику, але не використовується). Коли всі поля заповнені, крім аватара:
  1. `getMissingMessages()` повертає `[]` (пусто)
  2. `handleContinuePress` викликає `confirm()`
  3. `confirm()` бачить `!canSubmit` (бо `isAvatarDone === false`) і тихо виходить
  4. Користувач натискає кнопку — **нічого не відбувається**, жодного повідомлення
- **Код:**
```typescript
const getMissingMessages = () => {
  const missing: string[] = [];
  if (!isNameDone) missing.push(`- ${text.missingName}`);
  if (!isGenderDone) missing.push(`- ${text.missingGender}`);
  if (!isAgeDone) missing.push(`- ${text.missingAge}`);
  // ← avatar не перевіряється!
  return missing;
};
```
- **Очікувано:** Додати `if (!isAvatarDone) missing.push(text.missingAvatar);`

---

### BUG-1.8.3: Кнопка Continue візуально неактивна, але натискається [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/ProfileSetupScreen.tsx`
- **Строка:** 400-409
- **Функція:** `render`
- **Проблема:** `disabled={saving}` — кнопка блокується тільки під час збереження. Коли `canSubmit === false`, застосовується стиль `continueButtonDisabled` (opacity 0.45), але кнопка залишається активною. Користувач бачить "сірий" колір (очікує що не можна натиснути), але може натиснути — і нічого не станеться (через BUG-1.8.2).
- **Код:**
```typescript
<TouchableOpacity
  style={[styles.continueButton, (!canSubmit || saving) && styles.continueButtonDisabled]}
  onPress={handleContinuePress}
  disabled={saving}  // ← має бути: disabled={!canSubmit || saving}
  activeOpacity={0.86}
>
```
- **Очікувано:** `disabled={!canSubmit || saving}`

---

### BUG-1.8.4: Stale `user?.id` fallback може записати дані під чужий uid [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/ProfileSetupScreen.tsx`
- **Строка:** 249
- **Функція:** `confirm()`
- **Проблема:** Якщо `auth.currentUser` — null (не автентифіковано), але `user?.id` зберігся в Redux від попередньої (anonymous) сесії, то `uid` буде старим. Дані профілю запишуться під старим uid, а новий Firebase Auth User нічого не отримає. Пов'язано з BUG-1.7.1.
- **Код:** `const uid = auth.currentUser?.uid || user?.id;`
- **Очікувано:** Не використовувати `user?.id` як fallback. Якщо `auth.currentUser` немає — зберігати тільки локально.

---

### BUG-1.10.1: `subscribeAuthorizedDeviceStatus` некоректно видаляє Firebase listener [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/services/deviceAuth.ts`
- **Строка:** 640
- **Функція:** `subscribeAuthorizedDeviceStatus()`
- **Проблема:** `onValue` повертає unsubscribe-функцію. Код загортає її в `off(deviceRef, 'value', unsubscribe)`, передаючи функцію unsubscribe як callback. `off()` очікує ту саму callback-функцію, що передавалась у `onValue`, а не обгортку. Listener ніколи не видаляється → **витік пам'яті + дубльовані сповіщення**.
- **Код:**
```typescript
const unsubscribe = onValue(deviceRef, (snapshot) => {
  // ...
}, (error) => {
  // ...
});
return () => off(deviceRef, 'value', unsubscribe); // ← unsubscribe !== оригінальний callback
```
- **Очікувано:** `return unsubscribe;` — використовувати вбудовану функцію відписки від `onValue`.

---

## ПЕРЕВІРЕНІ ФАЙЛИ БЕЗ БАГІВ

| Файл | Задача | Примітка |
|------|--------|----------|
| `src/components/InviteAccessIntroSlides.tsx` | 1.2 | OK |
| `src/utils/startAvatars.ts` | 1.7 | OK |
| `src/utils/userAvatar.ts` | 1.7 | OK |
| `src/utils/rateLimiter.ts` | 1.4 | OK |
| `src/utils/accessControl.ts` | 1.9 | OK |
| `src/screens/AccessRestrictedScreen.tsx` | 1.9 | OK (але dead code через SoftInviteAccessGate) |
| `src/utils/imageSafety.ts` | 1.6 | OK |
| `src/utils/passwordBreachCheck.ts` | 1.6 | OK (інтегровано в useFullRegistration) |
| `src/services/authProfileService.ts` | 1.8 | OK |
| `src/redux/slices/authSlice.ts` | 1.10 | OK |
| `src/services/sessionService.ts` | 1.10 | OK |
| `src/services/deviceAuth.ts` | 1.10 | 1 баг (BUG-1.10.1) |
| `src/utils/authGuard.ts` | 1.10 | OK |
| `src/firebase-auth-session.ts` | 1.10 | OK |

---

## НЕ ПЕРЕВІРЕНІ ЗАДАЧІ

*Всі 10 задач Дня 1 виконано.*

---

## РЕКОМЕНДАЦІЇ — що виправити ПЕРШИМ

1. **BUG-1.1.1** (HIGH) — ForceUpdateScreen не блокує онбординг.
2. **BUG-1.6.6** (HIGH) — Орфанні акаунти.
3. **BUG-1.8.2 + 1.8.3** (MEDIUM) — Кнопка Continue не працює/вводить в оману при відсутньому аватарі.
4. **BUG-1.3.2** (MEDIUM) — Різні вимоги до пароля.
5. **BUG-1.1.2** (MEDIUM) — Splash без timeout на Web.
6. **BUG-1.10.1** (MEDIUM) — Витік пам'яті в deviceAuth listener.

---

## ФОРМАТ ДЛЯ НОВОЇ СЕСІЇ

Для продовження аудиту в новій сесії запусти:
```
AGENT_SYSTEM_PROMPT.md — скинути в чат
Продовжити з:
DAY2_FEED_REQUESTS.md — День 2 (задачі 2.1-2.4 виконано, почати з 2.5)
```
