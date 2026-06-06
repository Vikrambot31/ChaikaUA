# 🔴 КРИТИЧНАЯ УЯЗВИМОСТЬ: Несанкционированный доступ к функциям связи

**Дата анализа:** 2026-06-06
**Критичность:** 🔴 ВЫСОКАЯ
**Статус:** УЯЗВИМО

---

## 📋 Резюме

Два экрана приложения (**Kontakt-XXX** и **Bizznes-Chaika**) позволяют **неавторизованным пользователям** напрямую открыть Viber и связаться с владельцами профилей **БЕЗ регистрации**, **БЕЗ системы запросов доступа** и **БЕЗ какой-либо аутентификации**.

---

## 🎯 Затронутые экраны

### 1. **Kontakt-XXX.tsx** (Знайомства на каву / Dating Screen)
- **Путь:** `src/screens/Kontakt-XXX.tsx`
- **Функция уязвимости:** `handleViber()` на строке 627-629
- **Использование:** Строка 1157 в `UserCardActionBar`

### 2. **Bizznes-Chaika.tsx** (Бизнес контакты / Business Screen)
- **Путь:** `src/screens/Bizznes-Chaika.tsx`
- **Функция уязвимости:** `handleViber()` на строке 1065-1067
- **Использование:** Строка 1591 в `UserCardActionBar`

---

## 🔍 Анализ уязвимости

### Контакт-XXX (Контакти Чайки):

**Уязвимый код:**
```tsx
// Строка 627-629 (БЕЗ защиты от анонима!)
const handleViber = (phoneRaw: string) => {
  void safeOpenViber(phoneRaw, language);
};

// Строка 1157 - использование (также уязвимо)
onContact={
  item.userId && item.userId !== user?.id
    ? () => openContactModal({ ... })  // ✅ Защищено
    : showPhone
    ? () => handleViber(item.phone)    // ❌ НЕ ЗАЩИЩЕНО!
    : undefined
}
```

**Поток атаки:**
```
1. Анонимный пользователь открывает экран Контакти Чайки
   ↓
2. Видит список карточек с телефонами (showPhone !== false)
   ↓
3. Кликает на кнопку контакта → handleViber()
   ↓
4. handleViber() НЕ проверяет user?.id
   ↓
5. Прямо открывает Viber с телефоном владельца
   ↓
6. Анонимный пользователь звонит/пишет БЕЗ регистрации!
```

### Bizznes-Chaika.tsx:

**Идентичный паттерн:**
```tsx
// Строка 1065-1067 (БЕЗ защиты!)
const handleViber = (phoneRaw: string) => {
  void safeOpenViber(phoneRaw, language);
};

// Строка 1591 - использование (также уязвимо)
onContact={
  item.userId && item.userId !== user?.id
    ? () => openContactModal({ ... })  // ✅ Защищено
    : showPhone
    ? () => handleViber(item.phone)    // ❌ НЕ ЗАЩИЩЕНО!
    : undefined
}
```

---

## 📊 Сравнение: Защищённые vs Уязвимые экраны

| Экран | Функция связи | Защита от анонима | Поведение | Статус |
|-------|---------------|-------------------|-----------|--------|
| **Контакти Чайки** | Viber (direct) | ❌ НЕТ | Прямо открывает Viber без auth | 🔴 УЯЗВИМО |
| **Bizznes-Chaika** | Viber (direct) | ❌ НЕТ | Прямо открывает Viber без auth | 🔴 УЯЗВИМО |
| Купу-Продам (Buy-Sell) | Contact Request | ✅ ДА | Modal + проверка auth | 🟢 ЗАЩИЩЕНО |
| Люди Чайки | Contact Request | ✅ ДА | Modal + проверка auth | 🟢 ЗАЩИЩЕНО |
| Дата-Детского-Места | Contact Request | ✅ ДА | Modal + проверка auth | 🟢 ЗАЩИЩЕНО |
| ItemDetailScreen | Contact Request | ✅ ДА | Modal + requireAuthForDetails | 🟢 ЗАЩИЩЕНО |
| ViewUserProfile | Contact Request | ✅ ДА | Modal + requireAuthForDetails | 🟢 ЗАЩИЩЕНО |

---

## 🛡️ Что происходит в ЗАЩИЩЁННЫХ экранах

В других экранах используется **правильный паттерн**:

```tsx
// ✅ ЗАЩИЩЕНО: требует auth перед openContactModal
onContact={item.userId && item.userId !== user?.id
  ? () => openContactModal({ ... })
  : undefined
}
```

При нажатии на ContactRequest modal внутри проверяется `ensureFirebaseAuth()`:

```tsx
// В useContactRequest hook:
const sendContactRequest = async (reason: string) => {
  const uid = await ensureFirebaseAuth();  // ← Требует регистрацию!
  // ... отправка запроса
}
```

---

## ⚠️ Почему это критично?

1. **Нарушение системы запросов доступа** — обход Contact Request modal
2. **Раскрытие телефонных номеров** — анонимные пользователи видят номера
3. **Прямое обращение к пользователям** — без отслеживания (нет логирования)
4. **Создание спама/харасса** — никакого контроля от приложения
5. **GDPR/ПД нарушение** — раскрытие персональных данных без согласия

---

## 🔧 Рекомендации по исправлению

### **ВАРИАНТ 1: Требовать регистрацию перед Viber** ✅ ЛУЧШИЙ

Добавить проверку auth перед `safeOpenViber()`:

**Kontakt-XXX.tsx (строка 627-629):**
```tsx
const handleViber = async (phoneRaw: string) => {
  // Проверка: есть ли пользователь?
  if (!user?.id) {
    Alert.alert(
      text.errorTitle,
      language === 'en'
        ? 'Registration required to contact users'
        : language === 'ru'
        ? 'Требуется регистрация для связи с пользователями'
        : 'Потрібна реєстрація для зв\'язку з користувачами',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: language === 'en' ? 'Sign up' : language === 'ru' ? 'Зареги' : 'Реєстрація',
          onPress: () => navigation.navigate('LoginScreen')
        }
      ]
    );
    return;
  }
  void safeOpenViber(phoneRaw, language);
};
```

**Bizznes-Chaika.tsx (строка 1065-1067):** — Тот же паттерн

### **ВАРИАНТ 2: Использовать Contact Request Modal** ✅ КОНСИСТЕНТНО

Заменить `handleViber()` на `openContactModal()` для всех случаев:

```tsx
onContact={
  item.userId && item.userId !== user?.id
    ? () => openContactModal({ ... })
    : showPhone
    ? () => openContactModal({
        userId: item.userId || 'anonymous',
        name: item.itemName ?? 'Unknown',
        photoURL: avatarUri || undefined,
        sourceType: 'lyudi',
        sourceId: item.id,
        sourceTitle: item.itemName
      })  // ← Требует auth через modal
    : undefined
}
```

---

## 📋 Чек-лист исправления

- [ ] **Kontakt-XXX.tsx** — добавить проверку `user?.id` в `handleViber()`
- [ ] **Bizznes-Chaika.tsx** — добавить проверку `user?.id` в `handleViber()`
- [ ] Протестировать: анонимный пользователь пытается кликнуть на кнопку Viber
- [ ] Протестировать: авторизованный пользователь может открыть Viber
- [ ] Добавить лог при попытке доступа без auth (для мониторинга)
- [ ] Проверить другие экраны на похожие паттерны

---

## 🧪 Сценарии тестирования

### ❌ Сценарий 1: Анонимный пользователь пытается звонить (ТЕКУЩЕЕ - УЯЗВИМО)
```
1. Открыть приложение БЕЗ логина
2. Перейти в Контакти Чайки ИЛИ Bizznes-Chaika
3. Нажать на кнопку контакта на карточке
4. ✗ РЕЗУЛЬТАТ: Viber открывается СРАЗУ
5. ✗ Анонимный пользователь может позвонить
```

### ✅ Сценарий 2: Анонимный пользователь пытается звонить (ИСПРАВЛЕНО)
```
1. Открыть приложение БЕЗ логина
2. Перейти в Контакти Чайки ИЛИ Bizznes-Chaika
3. Нажать на кнопку контакта на карточке
4. ✓ РЕЗУЛЬТАТ: Alert "Требуется регистрация"
5. ✓ Предложение перейти на LoginScreen
6. ✓ Viber НЕ открывается
```

### ✅ Сценарий 3: Авторизованный пользователь звонит (ОК)
```
1. Залогиниться в приложение
2. Перейти в Контакти Чайки ИЛИ Bizznes-Chaika
3. Нажать на кнопку контакта на карточке
4. ✓ РЕЗУЛЬТАТ: Viber открывается нормально
5. ✓ Contact Request modal может быть логирован (опционально)
```

---

## 📝 Влияние на другие компоненты

Фикс **НЕ затронет:**
- ✅ `useContactRequest()` hook
- ✅ `ContactReasonModal`
- ✅ Другие экраны (они уже защищены)
- ✅ `safeOpenViber()` утилита

Фикс **может изменить**:
- ⚠️ UX для анонимных пользователей (требует регистрации)
- ⚠️ Логирование попыток доступа (рекомендуется добавить)

---

## 📞 Дополнительно

Рассмотрите добавление логирования попыток несанкционированного доступа:

```tsx
const handleViber = async (phoneRaw: string) => {
  if (!user?.id) {
    // Логирование попытки доступа
    console.warn('[Security] Anonymous user attempted to open Viber', {
      timestamp: new Date().toISOString(),
      screen: 'Kontakt-XXX',
      phone: phoneRaw.slice(-4),  // только последние 4 цифры
    });

    // Alert...
    return;
  }
  void safeOpenViber(phoneRaw, language);
};
```

---

## 🎯 Приоритет

**СРОЧНО** (Critical) — исправить до релиза
- Риск: Спам, харассмент, раскрытие ПД
- Сложность: Низкая (2-3 строки кода)
- Время: ~15 минут

