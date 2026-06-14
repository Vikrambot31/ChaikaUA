# Техническое задание: Унификация цвета кнопок приложения

**Статус:** Новое задание
**Приоритет:** Средний
**Категория:** UI/UX унификация, дизайн
**Дата создания:** 2026-06-12

---

## 1. Описание проблемы

В приложении используются кнопки с двумя разными оттенками терракотового цвета:

- **Текущий цвет большинства кнопок:** `SCREEN_THEME.terracotta` = `#C77A5D` (темнее)
- **Желаемый цвет:** `#CA8A04` (золотисто-желтый, как кнопка "листать" на экране Контакты)

Кнопка "Почати листати" / "Начать листать" на экране **Контакты** (Kontakt-XXX.tsx) имеет иную визуальную идентичность и должна быть эталоном для всех кнопок в приложении.

---

## 2. Цель

Привести все кнопки приложения к единому дизайну путем замены текущего терракотового цвета (`#C77A5D`) на новый золотой цвет (`#CA8A04`).

---

## 3. Список компонентов и экранов, подлежащих изменению

### 3.1 Определение цвета в теме
- **Файл:** `src/utils/screenTheme.ts`
- **Строка:** 7
- **Текущее значение:** `terracotta: '#C77A5D',`
- **Новое значение:** `terracotta: '#CA8A04',`

### 3.2 Прямое использование `SCREEN_THEME.terracotta` (34+ мест)

**Компоненты:**
1. `src/components/ForceUpdateScreen.tsx:187` - фон кнопки
2. `src/components/BlockedScreen.tsx:131` - цвет текста
3. `src/components/FirstLaunchOnboarding.tsx:233,236` - фон кнопок (2 места)
4. `src/components/FilterButton.tsx:14` - цвет типа SHOP
5. `src/components/FeatureRatingBanner.tsx:306` - фон кнопки
6. `src/components/PremiumPromoNotice.tsx:153` - фон кнопки
7. `src/components/OnboardingSlides.tsx:280,286` - фон кнопок (2 места)
8. `src/components/ScreenTooltip.tsx:44` - accentColor
9. `src/components/PlaceMarker.tsx:24` - цвет типа SHOP
10. `src/components/LanguagePickerOnboarding.tsx:165,185,192,200` - borderColor, color, backgroundColor (4 места)
11. `src/components/MaintenanceScreen.tsx:141,159` - цвет и borderColor
12. `src/components/PlaceCard.tsx:19` - цвет типа SHOP
13. `src/components/SystemStatusScreen.tsx:61` - фон кнопки
14. `src/components/TactileButton.tsx:18` - фон
15. `src/components/PhotoUploadField.tsx:491` - **фон кнопки "выбрать еще фото"** ← ГЛАВНАЯ КНОПКА

**Экраны:**
16. `src/screens/BonusWalletScreen.tsx:236,286,360,640` - loader, icon, цвет транзакции, фон (4 места)
17. `src/screens/Detal-Detskogo-Mesta.tsx:714,959,994,1001` - icon, backgroundColor, borderColor, color (4 места)
18. `src/screens/BonusPromotionPurchaseScreen.tsx:319,588,589,642` - loader, background (4 места)
19. `src/screens/CreateBuySellScreen.tsx:412,419` - backgroundColor (2 места)
20. `src/screens/Bizznes-Chaika.tsx:2269` - submitBtn backgroundColor
21. `src/screens/admin/SecurityControlScreen.tsx:1206,1422,1473` - loader, color, backgroundColor (3 места)
22. `src/screens/BusinessPromoEditorScreen.tsx:217` - loader
23. `src/screens/AdminUserErrorsScreen.tsx:189` - loader
24. `src/screens/BusinessClaimScreen.tsx:179,328` - icon, backgroundColor (2 места)
25. `src/screens/BusinessMenuEditorScreen.tsx:230` - loader
26. `src/screens/Eda-Na-Chayke.tsx:833,1669` - icon color, text color (2 места)
27. `src/screens/Ekran-Koda-Zagruzki.tsx:69` - backgroundColor TactileIcon
28. `src/screens/Detal-Detskogo-Predlozheniya.tsx:294,305,380` - backgroundColor, color (3 места)
29. `src/screens/EditProfileScreen.tsx:816,911,981,1044` - backgroundColor (4 места)
30. `src/screens/Foto-Dlya-Dushi.tsx:883` - loader
31. `src/screens/Forma-Zayavki.tsx:832,978,979,1022,1023,1046` - color, backgroundColor, borderColor (6 мест)
32. `src/screens/Foto-Rayona.tsx:465` - loader
33. `src/screens/Detal-Salona.tsx:615,877,884` - icon, borderColor, color (3 места)
34. `src/screens/Interesnye-Mesta.tsx:150,183` - backgroundColor, color (2 места)
35. `src/screens/ItemDetailScreen.tsx:402,671,788,850,853` - icon, backgroundColor, borderColor, text (5 мест)
36. `src/screens/Karta-Chayki.native.tsx:481,766,767,822,884,958,1049` - icon, backgroundColor, borderColor (7 мест)
37. `src/screens/Kto-Poteryal.tsx:541,629,921,971` - icon, loader, backgroundColor (4 места)
38. `src/screens/Kuplu-Prodam.tsx:790,802,806,834` - color, backgroundColor (4 места)
39. `src/screens/Mesta-Chayki.tsx:239,343` - accent, color (2 места)
40. `src/screens/Nalashtuvannya-Spovishchen.tsx:236` - backgroundColor TactileIcon
41. `src/screens/Obyavleniya.tsx:38` - backgroundColor TactileIcon
42. `src/screens/OSBB-AdminPanel.tsx:261,353` - color (2 места)
43. `src/screens/Onlayn-Chat.tsx:722,752,1345` - loader, tint, backgroundColor (3 места)
44. `src/screens/OSBB-Finansy.tsx:460,631,751,930,1057,1058` - icon, color, backgroundColor (6 мест)
45. `src/screens/OSBB-Golosovanie.tsx:151` - BAR_COLORS
46. `src/screens/OSBB-Hub.tsx:534,666,717` - icon, backgroundColor (3 места)
47. `src/screens/OSBB-Novosti.tsx:203,280,283` - icon, backgroundColor, shadowColor (3 места)
48. `src/screens/OSBB-Sbor.tsx:360` - addBtn backgroundColor
49. `src/screens/Poisk-Raboty.tsx:1303,1356,1379` - submitBtn, badge (3 места)
50. `src/screens/Pomoch-Sosedyam.tsx:343,353,366,380` - backgroundColor (4 места)
51. `src/screens/Poruchitel.tsx:314,401` - loader (2 места)
52. `src/screens/Pro-Prilozhenie.tsx:201,324,338` - backgroundColor (3 места)
53. `src/screens/Problemy-Chayki.tsx:871,879,1016,1077,1088,1133,1134,1138,1364,1365,1370` - color, icon, loader, filter (11 мест)
54. `src/screens/ProfileSetupScreen.tsx:359,478,479,490,499,521,522` - color, borderColor, backgroundColor (7 мест)
55. `src/screens/PromoCreditsTopupScreen.tsx:195,207,440,469` - loader, accentColor, color, backgroundColor (4 места)
56. `src/screens/PromoCreditsAdminScreen.tsx:319,334,464` - loader (3 места)
57. `src/screens/Profil-Polzovatelya.tsx:549,596,715,1000,1053,1370,1371,1393,1394` - color, icon, borderColor (9 мест)
58. `src/screens/QR-Kod.tsx:204,206` - backgroundColor, borderColor (2 места)
59. `src/screens/Registraciya-Polnaya.tsx:377,390,409,417` - backgroundColor, color, borderColor (4 места)
60. `src/screens/Reyting-Domov.tsx:331,429,450,621,630,643,664,701,725,727,739,776` - loader, icon, backgroundColor (12 мест)
61. `src/screens/Spisok-Mest.tsx:207,361,369,475` - backgroundColor, color (4 места)
62. `src/screens/Sport-Detal.tsx:181,187,211,221,248` - icon, loader, backgroundColor (5 мест)
63. `src/screens/StartAvatarPickerScreen.tsx:211,220,277` - borderColor, backgroundColor, color (3 места)
64. `src/screens/SupportScreen.tsx:257` - loader
65. `src/screens/Spravka.tsx:93,146,153` - backgroundColor, color (3 места)
66. `src/screens/Sport-Na-Chayke.tsx:337` - gameTime color
67. `src/screens/UserErrorMonitorScreen.tsx:321,475,545,562` - icon, color, backgroundColor (4 места)
68. `src/screens/Eda-Na-Chayke.tsx:1669` - color
69. `src/screens/MyPhotosScreen.tsx:256,867,1308` - loader, error color, backgroundColor (3 места)
70. `src/photo-module/MyPhotosScreen.tsx:770,947,954,955` - color (4 места)

### 3.3 Эталонный дизайн
- **Файл:** `src/screens/Kontakt-XXX.tsx`
- **Стиль:** `swipeFilterStartBtn` (строка 2662)
- **Цвет:** `backgroundColor: '#CA8A04'`
- **Текст:** `swipeFilterStartBtnText` (строка 2663) — `color: '#612e51'`

---

## 4. Этапы выполнения

### Этап 1: Подготовка
- [ ] Создать backup текущего кода
- [ ] Убедиться, что все изменения будут в одной ветке (`codex/shared-building-ratings`)
- [ ] Документировать текущее состояние цветов

### Этап 2: Обновление темы
- [ ] Обновить значение `terracotta` в `src/utils/screenTheme.ts` с `#C77A5D` на `#CA8A04`

### Этап 3: Проверка и тестирование
- [ ] Запустить приложение в режиме разработки (Expo)
- [ ] Визуально проверить все 70+ мест использования кнопок
- [ ] Убедиться, что цвет последовательно применен во всех компонентах и экранах
- [ ] Проверить контрастность текста на новом фоне (особенно где текст белый на новом золотом фоне)
- [ ] Протестировать на разных экранах (iOS, Android, web)

### Этап 4: Финализация
- [ ] Создать commit с сообщением:
  ```
  Fix: Unify button colors across app — change terracotta from #C77A5D to #CA8A04

  Changes SCREEN_THEME.terracotta color from brownish (#C77A5D) to golden (#CA8A04)
  to match the "Start swiping" button on Contacts screen. Affects 70+ components
  and screens including PhotoUploadField, buttons, badges, and icons.
  ```
- [ ] Запушить в текущую ветку (codex/shared-building-ratings)

---

## 5. Файлы, подлежащие изменению

**Основной файл (КРИТИЧНО):**
- `src/utils/screenTheme.ts` — обновить линию 7

**Автоматически обновляются после изменения screenTheme.ts** (всего 70+ файлов):
- Все компоненты и экраны, использующие `SCREEN_THEME.terracotta`

---

## 6. Риски и проверки

| Риск | Проверка |
|------|----------|
| Неправильный оттенок золота | Сравнить с `#CA8A04` из `Kontakt-XXX.tsx:2662` |
| Плохая читаемость текста | Проверить контрастность белого текста на золотом фоне |
| Неполная замена | Grep-проверить все остаточные ссылки на старый `#C77A5D` |
| Визуальная несогласованность | Проверить на iOS, Android и web версиях |

---

## 7. Критерии приёма

- ✅ Все кнопки в приложении отображают новый цвет `#CA8A04`
- ✅ Нет остаточных ссылок на старый цвет `#C77A5D` в `SCREEN_THEME.terracotta`
- ✅ Текст читаемен на всех экранах
- ✅ Визуальный дизайн согласован с кнопкой "листать" на Контактах
- ✅ Тесты проходят без ошибок
- ✅ Commit успешно залит в репозиторий

---

## 8. Дополнительные заметки

- Это **единовременное изменение** — не требует миграции данных или логики
- Изменение только **визуальное** — не влияет на функциональность
- После изменения все кнопки будут выглядеть как эталонная кнопка на Контактах
- Color `#CA8A04` выглядит более ярко и привлекательно, чем текущий `#C77A5D`

---

**Автор ТЗ:** Claude Code
**Статус:** Готово к выполнению
