# ГЛОБАЛЬНАЯ ПОЛИРОВКА — ТОЧКА ПРОДОЛЖЕНИЯ
## Последнее обновление: 2026-06-27

---

## КАК НАЧАТЬ НОВУЮ СЕССИЮ

Скажи Claude:
> "Продолжаем глобальную полировку. Прочитай POLISH_REPORTS/SESSION_RESUME.md и GLOBAL_POLISH_SPEC.md и продолжи с этапа 5."

---

## ПРОГРЕСС

| Этап | Статус | Коммит | Отчёт |
|---|---|---|---|
| 1. Аудит и инвентаризация | ✅ ЗАВЕРШЁН | `ded739b` | STAGE1_AUDIT_REPORT.md |
| 2. Auth и безопасность | ✅ ЗАВЕРШЁН + 7 code fixes | `56324af` | STAGE2_SECURITY_REPORT.md |
| 3. UI/UX полировка (аудит) | ✅ АУДИТ ГОТОВ | `0a2349a` | STAGE3_UX_AUDIT_REPORT.md |
| 4. Локализация и контент | ✅ АУДИТ ГОТОВ | `23076f5` | STAGE4_LOCALIZATION_REPORT.md |
| 5. Производительность + P0 фиксы | ✅ ЗАВЕРШЁН | — | STAGE5_PERFORMANCE_REPORT.md |
| **6. Серверная часть Firebase** | ⬅️ **СЛЕДУЮЩИЙ** | — | — |
| 7. Модерация и контент | ⏳ | — | — |
| 8. Уведомления и онбординг | ⏳ | — | — |
| 9. Специфические фичи | ⏳ | — | — |
| 10. Admin Panel | ⏳ | — | — |
| 11. Тестирование | ⏳ | — | — |
| 12. Сборка и релиз | ⏳ | — | — |
| 13. Документация | ⏳ | — | — |

---

## ВЕТКА GIT
```
branch: codex/registration-avatar-flow
last commit: 23076f5
```

---

## ЧТО УЖЕ ИСПРАВЛЕНО В КОДЕ

### Этап 2 — 7 code fixes (уже в продакшн-коде):
1. **Viber auth bypass** — `auth.currentUser?.uid` в Kontakt-XXX, Bizznes-Chaika, ProfileRequestsScreen
2. **osbbSlice logout** — `extraReducers → auth/logout → initialState`
3. **subscriptionSlice logout** — `extraReducers → auth/logout → initialState`
4. **electricitySlice limits** — MAX_REPORTS=200, MAX_TODAY_REPORTS=100
5. **storage.rules** — 10MB limit + image-only content type validation на всех 15 путях

---

## ТОП НЕЗАКРЫТЫХ ПРОБЛЕМ (P0-P1)

### P0 — Критические:
| # | Проблема | Файл | Статус |
|---|---|---|---|
| 1 | ~~`dbSet()` уничтожает existing user data~~ | useFullRegistration.ts | ✅ FIXED (Stage 5) |
| 2 | Profile photo auto-approved (bypasses moderation) | ProfileSetupScreen.tsx:259 | ⏳ Stage 7 |
| 3 | ~~`reduce()` crash на empty array~~ | OSBB-Golosovanie.tsx:143 | ✅ FIXED (Stage 5) |
| 4 | ~~`.toLocaleTimeString()` на string → crash~~ | Status-Sveta.tsx:612,657 | ✅ FIXED (Stage 5) |
| 5 | osbb_collection_payments — любой юзер может писать | firebase.rules.json | ⏳ Stage 6 |

### P1 — Высокий приоритет:
| # | Проблема | Файл |
|---|---|---|
| 6 | Raw EN category в модерации | Moderaciya-Foto.tsx:497 |
| 7 | Raw buildingId в модерации | Moderaciya-Foto.tsx:690 |
| 8 | Dark mode отсутствует | Mestsa-i-Lyudi-Hub.tsx |
| 9 | ProfileCompletenessBadge считает ContactListing, не профиль | ProfileCompletenessBadge.tsx |
| 10 | 44/45 Redux selectors без мемоизации | selectors.ts |
| 11 | ~15 мест hardcoded `uk-UA` locale в датах | разные файлы |

---

## ЭТАП 5 — ЧТО ДЕЛАТЬ

По `GLOBAL_POLISH_SPEC.md` раздел **ЭТАП 5 — ПРОИЗВОДИТЕЛЬНОСТЬ**:

### 5.1 Оптимизация загрузки
- `SplashAnimation.tsx` — не блокирует main thread
- `startupSync.ts` — минимальный набор данных при старте
- `StartupSyncBanner.tsx` — не мелькает при быстрой сети

### 5.2 Кэширование
- `cacheLayer.ts` — TTL для каждого типа данных
- RTDB listeners — отписка при размонтировании (memory leak проверка)
- `stateSnapshotService.ts` — не переполняет AsyncStorage

### 5.3 Пагинация и списки
- `Spisok-Zayavok.tsx` — FlatList с `getItemLayout`, `keyExtractor`
- `Lyudi-Chayki.tsx` — пагинация пользователей
- `WhoLikedMeList.tsx` — виртуализация
- `SkeletonLoader.tsx` — применён на всех экранах с async-данными

### 5.4 Оптимизация Redux
- **44 selectors** без мемоизации → обернуть в `createSelector`

### 5.5 Оптимизация изображений
- `imageCompressor.ts` — применяется перед upload (уже есть в PhotoUploadEngine)
- WebP где поддерживается

---

## СТРУКТУРА ФАЙЛОВ ПРОЕКТА

```
C:\ChaikaUA\mobile-app-short\
├── GLOBAL_POLISH_SPEC.md          ← ГЛАВНЫЙ ПЛАН (13 этапов)
├── POLISH_REPORTS\
│   ├── SESSION_RESUME.md          ← ЭТОТ ФАЙЛ
│   ├── STAGE1_AUDIT_REPORT.md     ← Инвентаризация (6 крит, 46 средних)
│   ├── STAGE2_SECURITY_REPORT.md  ← Безопасность (7 фиксов применены)
│   ├── STAGE3_UX_AUDIT_REPORT.md  ← UX (48 находок)
│   └── STAGE4_LOCALIZATION_REPORT.md ← Локализация (15+ дат, issues)
├── src/
│   ├── screens/          106 экранов
│   ├── components/       70 компонентов
│   ├── services/         68 сервисов
│   ├── redux/slices/     11 слайсов (osbb/sub/elec — пофикшены)
│   └── ...
├── firebase.rules.json   RTDB rules (827 строк)
├── storage.rules         Storage rules (ПОФИКШЕНЫ: +10MB +image type)
└── app-version.json      v1.1.451
```

---

## ПРАВИЛА R-1..R-4 (обязательно соблюдать)

| Правило | Суть |
|---|---|
| R-1 | Не создавать новых Firebase rules — только корректировать |
| R-2 | Не ломать photo upload архитектуру |
| R-3 | Проверять зависимости перед изменением сервиса |
| R-4 | Обратная совместимость Redux — миграции обязательны |
