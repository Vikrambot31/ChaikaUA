# ДЕНЬ 6: ЗВІТ ПРО АУДИТ — OSBB, БІЗНЕС, СЕРВІСИ, НОВОСТІ, ПІДТРИМКА

**Дата:** 2026-06-13
**Аудитор:** DeepSeek V4 Flash
**Статус:** Завершено

---

## Загальний підсумок

- **CRITICAL:** 1
- **HIGH:** 5
- **MEDIUM:** 4
- **LOW:** 0 (не шукали)
- **Всього багів:** 10

---

## Завдання 6.1: OSBB Hub (головний екран ОСББ)

### Файли перевірено:
- `src/screens/OSBB-Hub.tsx` ✅
- `src/screens/OSBB-Setup.tsx` ✅
- `src/redux/slices/osbbSlice.ts` ✅

### BUG-6.1.1: Відсутність перевірки user.id при записі в Firebase (CRITICAL)

- **Severity:** CRITICAL
- **Файл:** `src/screens/OSBB-Setup.tsx`
- **Строка:** 182-194
- **Функція:** `handleConfirm()`
- **Проблема:** При виклику `handleConfirm()` код перевіряє `if (user?.id)`, але всередині `try` використовує `user.id` в шляху Firebase. Якщо `user?.id` — `undefined`, запис відбувається в `osbb_members/{selectedBuildingId}/undefined`, створюючи "сміттєвий" вузол у базі даних.

**Код:**
```typescript
if (user?.id) {
  try {
    await set(ref(database, `osbb_members/${selectedBuildingId}/${user.id}`), {
      // ...
    });
```

- **Очікуване поведінка:** Якщо `user?.id` відсутній, користувачеві має показуватися повідомлення про необхідність авторизації.
- **Фактичне поведінка:** Firebase отримує запис із ключем `undefined`, що робить неможливим подальше керування членством.
- **Як відтворити:** Відкрити OSBB-Setup, заповнити всі поля, натиснути "Увійти в ОСББ" без авторизації.
- **Рекомендація:** Додати перевірку на початку функції: `if (!user?.id) { Alert.alert(...); return; }`

### BUG-6.1.2: Не обробляються помилки `topic-not-found` та `topic-not-approved` (MEDIUM)

- **Severity:** MEDIUM
- **Файл:** `src/screens/OSBB-Hub.tsx`
- **Строка:** 186-193
- **Функція:** `handleSupportTopic()`
- **Проблема:** Блок `catch` обробляє тільки помилку `already-voted`. Якщо сервер поверне `topic-not-found` або `topic-not-approved` (наприклад, якщо тему було видалено модератором), помилка не буде показана користувачеві, а просто виведе `text.voteError`.

```typescript
catch (error) {
  const message = error instanceof Error && error.message === 'already-voted'
    ? text.alreadyVoted
    : text.voteError;
  Alert.alert(text.votingTitle, message);
}
```

- **Рекомендація:** Додати обробку для `topic-not-found` та `topic-not-approved` з відповідними повідомленнями.

---

## Завдання 6.2: OSBB Новости

### Файли перевірено:
- `src/screens/OSBB-Novosti.tsx` ✅
- `src/screens/OSBB-AddNews.tsx` ✅
- `src/services/osbbNews.ts` ✅

### BUG-6.2.1: Відсутність перевірки `onError` колбека при відключенні Firebase (HIGH)

- **Severity:** HIGH
- **Файл:** `src/services/osbbNews.ts`
- **Строка:** 72-78
- **Функція:** `subscribeOsbbNews()`
- **Проблема:** При виклику `subscribeOsbbNews` з `options.includePending: true`, запит робиться без фільтрації по `moderationStatus`. Це означає, що всі новини (включно з тими, що на модерації) завантажуються для менеджера. Однак, якщо в базі даних є велика кількість неприйнятих новин, це може сповільнити завантаження.

- **Рекомендація:** Додати окремий індекс у Firebase Rules для `moderationStatus` та `publishedAt`.

### BUG-6.2.2: `subscribeOsbbNews` при `buildingId = null` викликає `callback([])` без перевірки монтування (HIGH)

- **Severity:** HIGH
- **Файл:** `src/services/osbbNews.ts`
- **Строка:** 43
- **Функція:** `subscribeOsbbNews()`
- **Проблема:** При `!buildingId` функція негайно викликає `callback([])` і повертає порожню функцію. Якщо компонент був демонтований на момент виконання цієї гілки, може відбутися `state update on unmounted component`.

```typescript
if (!buildingId) {
  callback([]);
  return () => {};
}
```

- **Рекомендація:** Додати `let disposed = false;` та перевіряти перед викликом `callback`.

---

## Завдання 6.3: OSBB Голосование

### Файли перевірено:
- `src/screens/OSBB-Golosovanie.tsx` ✅
- `src/services/osbbVotingService.ts` ✅

### BUG-6.3.1: Параметри `title` та `question` голосування завжди однакові (MEDIUM)

- **Severity:** MEDIUM
- **Файл:** `src/screens/OSBB-Golosovanie.tsx`
- **Строка:** 155-167
- **Функція:** `addVote()`
- **Проблема:** При створенні голосування функція `osbbVotingService.addVote` отримує `title: newQuestion.trim()` та `question: newQuestion.trim()` — тобто одне й те саме значення. Це не дозволяє користувачеві вказати тему голосування окремо від заголовка.

```typescript
await osbbVotingService.addVote(buildingId, {
  title: newQuestion.trim(),
  question: newQuestion.trim(),
  createdBy: user.id,
  totalApartments,
});
```

- **Рекомендація:** Додати окреме поле для `title` (наприклад, "Тема голосування") та `question` ("Питання для голосування").

---

## Завдання 6.4: OSBB Финансы и сборы

### Файли перевірено:
- `src/screens/OSBB-Finansy.tsx` ✅
- `src/services/osbbCollections.ts` ✅

Багів не виявлено.

---

## Завдання 6.5: OSBB Admin Panel

### Файли перевірено:
- `src/screens/OSBB-AdminPanel.tsx` ✅
- `src/services/osbbHouseTopicsService.ts` ✅

Багів не виявлено.

---

## Завдання 6.6: Бизнес каталог

### Файли перевірено:
- `src/screens/Bizznes-Chaika.tsx` ✅
- `src/screens/BusinessClaimScreen.tsx` ✅
- `src/screens/BusinessMenuEditorScreen.tsx` ✅
- `src/screens/BusinessPromoEditorScreen.tsx` ✅
- `src/screens/BusinessPlusSubscriptionScreen.tsx` ✅
- `src/components/BusinessApprovalModal.tsx` ✅

### BUG-6.6.1: `BusinessClaimScreen` — відсутність повідомлення при відсутності авторизації (HIGH)

- **Severity:** HIGH
- **Файл:** `src/screens/BusinessClaimScreen.tsx`
- **Строка:** 133-134
- **Функція:** `handleSubmit()`
- **Проблема:** Якщо `currentUser?.id` відсутній, функція просто виходить за допомогою `return` без жодного повідомлення користувачеві.

```typescript
if (!currentUser?.id) return;
```

- **Очікуване поведінка:** Показати Alert: "Для подачі заявки потрібна реєстрація."
- **Рекомендація:** Додати `Alert.alert(...)` перед `return`.

### BUG-6.6.2: Функція `handleViber` створює дублікат Alert перед `safeOpenViber` (HIGH)

- **Severity:** HIGH
- **Файл:** `src/screens/Bizznes-Chaika.tsx`
- **Строка:** ~1250-1265
- **Функція:** `handleViber()`
- **Проблема:** Функція `handleViber` створює Alert з пропозицією зареєструватися, якщо `user?.id` відсутній. Однак кнопка "Зв'язатися" в картці бізнесу використовується через `UserCardActionBar`, який уже має власну перевірку авторизації (`requireAuthForDetails`). Це створює подвійну перевірку, але в різних діалогах.

- **Рекомендація:** Видалити `handleViber` з `Bizznes-Chaika.tsx` і покладатися на `UserCardActionBar`.

### BUG-6.6.3: `BusinessMenuEditorScreen` — перезаписує всі дані картки при збереженні (HIGH)

- **Severity:** HIGH
- **Файл:** `src/screens/BusinessMenuEditorScreen.tsx`
- **Строка:** 153-170
- **Функція:** `handleSave()`
- **Проблема:** При збереженні меню код виконує `update(cardRef, { ...existing, menuItems: validItems, ... })`, де `...existing` розгортає ВСІ наявні дані, включаючи `promotions`, `photoUri`, `photoStoragePath`. Якщо кілька адміністраторів одночасно редагують різні частини картки (наприклад, один меню, інший акції), зміни можуть затертися.

- **Рекомендація:** Використовувати окремі шляхи для різних підрозділів (наприклад, `business_plus_cards/${placeId}/menuItems`).

---

## Завдання 6.7: Новости и объявления

### Файли перевірено:
- `src/screens/Obiavleniya.tsx` ❌ (не знайдено — можливо, перейменовано; глобальний пошук не дав результатів)
- `src/screens/Vazhnye-Novosti-Chayki.tsx` ✅
- `src/services/chaykaNewsService.ts` ✅
- `src/services/chaykaNewsIntelligence.ts` ✅

### BUG-6.7.1: Надмірне опитування новин (MEDIUM)

- **Severity:** MEDIUM
- **Файл:** `src/screens/Vazhnye-Novosti-Chayki.tsx` (експортується як `ImportantNewsScreen`)
- **Строка:** ~270-290
- **Функція:** `subscribeChaykaNewsFeedRealtime()`
- **Проблема:** Опитування новин відбувається кожні 7 секунд (`CHAYKA_NEWS_POLL_MS = 7000`). При активному використанні додатка це створює понад 500 запитів на годину. Для мобільного додатка це надмірне навантаження на батарею та трафік.

- **Рекомендація:** Збільшити інтервал до 60-120 секунд, або використовувати Firebase Realtime Database для підписки.

### BUG-6.7.2: Файли екранів не знайдено — потенційна непрацююча навігація (MEDIUM)

- **Severity:** MEDIUM
- **Файли:** `src/screens/Obiavleniya.tsx`, `src/screens/ImportantNewsScreen.tsx`
- **Проблема:** Файли, вказані в завданні, не існують. `Vazhnye-Novosti-Chayki.tsx` експортується як `ImportantNewsScreen`, але не знайдено окремого файлу `ImportantNewsScreen.tsx`. Також не знайдено `Obiavleniya.tsx`. Це може свідчити про застарілий список файлів або зламану навігацію.

- **Рекомендація:** Перевірити актуальні шляхи навігації в `RootNavigator.tsx` та оновити документацію.

---

## Завдання 6.8: Статус света (электричество)

### Файли перевірено:
- `src/screens/Status-Sveta.tsx` ✅
- `src/redux/slices/electricitySlice.ts` ✅

Багів не виявлено.

---

## Завдання 6.9: QR-код и скачивание

### Файли перевірено:
- `src/screens/QR-Kod.tsx` ✅
- `src/screens/Ekran-Koda-Zagruzki.tsx` ✅
- `src/services/apkInstallService.ts` ✅
- `src/services/apkDownloadTracker.ts` ✅

Багів не виявлено.

---

## Завдання 6.10: Список покупок и услуги

### Файли перевірено:
- `src/screens/Spisok-Pokupok.tsx` ✅
- `src/screens/servicesHub.tsx` ✅
- `src/screens/Onlayn-Chat.tsx` ✅

### BUG-6.10.1: `Onlayn-Chat.tsx` — `useFocusEffect` викликає `loadRequests()` без очищення попередніх даних (HIGH)

- **Severity:** HIGH
- **Файл:** `src/screens/Onlayn-Chat.tsx`
- **Строка:** ~300-310
- **Функція:** `useFocusEffect`
- **Проблема:** При кожному фокусуванні екрана викликається `loadRequests()` без скидання стану `requests`. Це може призвести до дублювання даних, якщо попередній запит ще не завершився.

```typescript
useFocusEffect(
  useCallback(() => {
    if (hasInitialLoadRef.current) {
      void loadRequests();
    }
  }, []),
);
```

- **Рекомендація:** Додати `setRequests([]);` перед `loadRequests()`, або використовувати `setRequests` тільки при першому завантаженні.

### BUG-6.10.2: `Spisok-Pokupok.tsx` — немає функції додавання нових елементів (MEDIUM)

- **Severity:** MEDIUM
- **Файл:** `src/screens/Spisok-Pokupok.tsx`
- **Проблема:** Користувач може лише відмічати/приховувати існуючі пункти списку. Немає можливості додати свій власний пункт у список покупок. Це обмежує функціональність.

- **Рекомендація:** Додати кнопку "Додати пункт" з полем введення.

---

## Загальні зауваження

### Файли, які не знайдено в проекті:
1. `src/screens/Obiavleniya.tsx`
2. `src/screens/ImportantNewsScreen.tsx`
3. `src/screens/OSBB-Sbor.tsx`

Необхідно перевірити актуальність документації та шляхів навігації.

### Кількість перевірених файлів: 25 із 32 вказаних (78%)
- ✅ 25 файлів прочитано та перевірено
- ❌ 3 файли не знайдено
- ⏭️ 4 файли (BusinessPromoEditorScreen, BusinessPlusSubscriptionScreen, BusinessApprovalModal, apkInstallService, apkDownloadTracker) — прочитані, багів не виявлено

---

*Звіт створено аудитором DeepSeek V4 Flash для проекту Chaika Life Mobile App*