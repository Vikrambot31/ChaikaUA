# ГЛОБАЛЬНАЯ ПОЛИРОВКА — ChaikaUA Mobile App
## Техническое задание v1.1 — 2026-06-27

> **Цель:** Полный цикл доводки приложения до production-качества: UX, безопасность, производительность, стабильность, контент, серверная часть. Приложение версии 1.1.451, платформа Android/iOS/Web, React Native Expo + Firebase.

---

## ЖЁСТКИЕ ОГРАНИЧЕНИЯ (нарушение недопустимо)

> Эти правила применяются ко **всем этапам** без исключений.

| # | Правило |
|---|---|
| R-1 | **Не создавать новых Firebase Security Rules** — только корректировать существующие правила в `firebase.rules.json` и `storage.rules` |
| R-2 | **Не ломать текущую систему загрузки фото** — `photoUploadService.ts`, `unifiedPhotoUpload.ts`, `PhotoUploadEngine.ts`, REST endpoint `/v0/`, bucket `.firebasestorage.app` и весь `photo-module/` должны продолжать работать без изменений архитектуры |
| R-3 | **Перед изменением любого сервиса** — убедиться что нет зависимостей, которые сломает правка (проверять импорты и вызывающий код) |
| R-4 | **Обратная совместимость Redux** — миграции данных при изменении структуры слайсов обязательны |

---

## ОБЗОР СИСТЕМЫ

| Параметр | Значение |
|---|---|
| Версия | 1.1.451 |
| Платформа | React Native Expo 50 |
| Backend | Firebase RTDB + Storage + Functions + Hosting |
| Экраны | 106 screen-файлов |
| Компоненты | 70 компонентов |
| Сервисы | 68 service-файлов |
| Утилиты | 48 utility-модулей |
| i18n | UA / RU / EN |
| Auth | Firebase Auth + Google + Facebook + Apple |
| State | Redux Toolkit + Redux-Persist |

---

# ЭТАПЫ ТЕХНИЧЕСКОГО ЗАДАНИЯ

---

## ЭТАП 1 — АУДИТ И ИНВЕНТАРИЗАЦИЯ ✅ ЗАВЕРШЁН (2026-06-27)

> **Отчёт:** [`STAGE1_AUDIT_REPORT.md`](STAGE1_AUDIT_REPORT.md) — 6 критических, 46 средних, 59+ низких находок

### 1.1 Инвентаризация всех экранов
- [x] Составить реестр всех 97 экранов с описанием назначения
- [x] Отметить экраны без тестирования (не охваченные E2E) — 0 E2E тестов
- [x] Выявить дублирующие экраны — 1 архивный: `Vibor-Temy-Zayavki-OLD.tsx`
- [x] Зафиксировать экраны с hardcoded-текстом — **16 экранов** без i18n
- [x] Список экранов доступных только admin/moderator — **9 экранов** с ролевыми проверками

### 1.2 Инвентаризация навигации
- [x] Полная карта маршрутов `RootNavigator.tsx` — **98 маршрутов** зарегистрировано
- [x] Выявить «мёртвые» маршруты — **23+ мёртвых** (зарегистрированы, не вызываются)
- [x] Проверить Deep Linking — **45 deeplink** настроено, **50+ отсутствуют**
- [x] Проверить Back navigation — `backBehavior="history"` на tabs, корректно

### 1.3 Аудит Redux-состояния
- [x] Проверить 11 слайсов на утечки данных — **osbb slice НЕ очищается при logout** (CRITICAL)
- [x] Проверить миграции (v1→v4) — корректны, v3 самая частая
- [x] Проверить `MAX_PERSISTED_ITEMS = 200` — адекватно, но electricity без лимита (CRITICAL)
- [x] Очистка orphaned-данных при logout — **osbb + subscription НЕ очищаются**

### 1.4 Аудит Firebase-правил
- [x] Полный review `firebase.rules.json` — 90+ путей, **12 public-read**
- [x] Полный review `storage.rules` — 15 путей, **ВСЕ без size/type validation** (CRITICAL)
- [x] Тест правил — 2 файла тестов, покрытие ~30-40%
- [x] Выявить пути без auth-проверки — **12 путей** (11 намеренных + 1 risk: app_control)
- [x] Выявить пути с чрезмерно широкими правами — **2 пути** (osbb_payments, bonus_triggers)

---

## ЭТАП 2 — АУТЕНТИФИКАЦИЯ И БЕЗОПАСНОСТЬ

### 2.1 Поток регистрации
- [ ] `Registraciya-Polnaya.tsx` — полный UX-аудит формы
- [ ] `ProfileSetupScreen.tsx` — проверка обязательных полей
- [ ] `StartAvatarPickerScreen.tsx` — работа выбора аватара
- [ ] Валидация номера телефона (префиксы UA/RU/EU)
- [ ] Проверка пароля через HIBP (Have I Been Pwned)
- [ ] Реферальная система — порядок записи и источник

### 2.2 Поток входа
- [ ] `Vkhod.tsx` — все кнопки провайдеров (Google, Facebook, Apple, Email)
- [ ] Восстановление сессии после перезагрузки приложения
- [ ] Обработка ошибок auth (неверный пароль, сеть, блокировка)
- [ ] Срок жизни токена — автообновление Firebase Auth
- [ ] `AuthDiagnosticScreen.tsx` — доступ только для admin

### 2.3 Контроль доступа
- [ ] `AppAccessGuard.tsx` — корректная работа на всех защищённых экранах
- [ ] `AccessRestrictedScreen.tsx` — понятное сообщение пользователю
- [ ] `PendingApprovalScreen.tsx` — статус одобрения в реальном времени
- [ ] `InviteAccessScreen.tsx` — проверка инвайт-кода
- [ ] Роли: user / moderator / admin — полная проверка разграничения
- [ ] Виber Auth Bypass — **КРИТИЧНО**: `Kontakt-XXX` и `Bizznes-Chaika` — анонимные Viber-звонки без проверки `user?.id` (из audit)

### 2.4 Безопасность форм
- [ ] Все `<TextInput>` с паролями — `secureTextEntry`, autocomplete="off"
- [ ] SQL/NoSQL injection защита (все Firebase `.set()` с пользовательскими данными)
- [ ] XSS в web-компонентах — `dangerouslySetInnerHTML` — проверка
- [ ] Лимиты на загрузку файлов (размер, тип, количество)
- [ ] Rate limiting на регистрацию (предотвращение спама)

### 2.5 Защита API
- [ ] `securityRoles.ts` — проверка логики ролей на клиенте + дублирование на сервере
- [ ] `securityAdminService.ts` — операции только через проверенный UID
- [ ] `securityAuditLogger.ts` — логирование всех критических действий
- [ ] `emergencyAccess.ts` — emergency режим без обхода auth

---

## ЭТАП 3 — UI/UX ПОЛИРОВКА

### 3.1 Главные экраны
- [ ] `Glavny-Ekran.tsx` — приветствие, карточки, CTA-кнопки — UX review
- [ ] `Karta-Chayki.tsx` — маркеры, zoom, поиск — платформо-специфичность (native/web)
- [ ] `Mestsa-i-Lyudi-Hub.tsx` — навигация по хабу
- [ ] `servicesHub.tsx` — структура и CTA

### 3.2 Система заявок
- [ ] `Forma-Zayavki.tsx` — валидация всех полей, фото-загрузка
- [ ] `Vibor-Temy-Zayavki.tsx` — корректный список тем, без дублей
- [ ] `Detal-Zayavki.tsx` — отображение статуса, комментарии, история
- [ ] `Moi-Zayavki.tsx` — пагинация, сортировка
- [ ] `Istoriya-Zaprosov.tsx` — фильтрация по дате и статусу
- [ ] `RequestItem.tsx` — корректный рендер категорий (не EN-коды)

### 3.3 Профиль пользователя
- [ ] `Profil-Polzovatelya.tsx` — полнота данных, редактирование
- [ ] `EditProfileScreen.tsx` — сохранение без потери полей
- [ ] `ViewUserProfileScreen.tsx` — публичный вид профиля
- [ ] `ProfileCompletenessBadge.tsx` — точный расчёт % заполнения
- [ ] Аватар: метаданные по полу/возрасту соответствуют таблице (из memory)

### 3.4 Фото-система
- [ ] `Zagruzka-Foto.tsx` — upload flow, прогресс, отмена
- [ ] `Moderaciya-Foto.tsx` — очередь модерации, approve/reject
- [ ] `MyApprovedPhotosScreen.tsx` — правильная коллекция `MyApprovedPhotos`
- [ ] `Foto-Dlya-Dushi.tsx` — галерея, фильтры
- [ ] `Foto-Rayona.tsx` — привязка к геозонам
- [ ] REST endpoint `/v0/` — правильный bucket `.firebasestorage.app`
- [ ] Upload без auth — **КРИТИЧНО**: проверить что неавторизованный не может загрузить

### 3.5 Чаты и сообщения
- [ ] `Onlayn-Chat.tsx` — WebSocket/RTDB реалтайм, отображение
- [ ] `InboxScreen.tsx` — список диалогов, непрочитанные
- [ ] `ContactCardChatScreen.tsx` — контактные карточки
- [ ] `VoiceRecorder.tsx` — запись и воспроизведение голоса
- [ ] `useInboxNotifications.ts` — push-уведомления при новом сообщении

### 3.6 OSBB (Управление домом)
- [ ] `OSBB-Hub.tsx` — структура разделов
- [ ] `OSBB-Sbor.tsx` — сборы: суммы, статусы, платежи
- [ ] `OSBB-Golosovanie.tsx` — голосование: анонимность, подсчёт
- [ ] `OSBB-Finansy.tsx` — финансовая отчётность
- [ ] `OSBB-Novosti.tsx` — лента новостей дома
- [ ] `OSBB-AdminPanel.tsx` — только admin-доступ

### 3.7 Бизнес-функции
- [ ] `Bizznes-Chaika.tsx` — листинг бизнесов, рейтинги
- [ ] `BusinessClaimScreen.tsx` — процесс заявки на бизнес
- [ ] `BusinessMenuEditorScreen.tsx` — редактор меню
- [ ] `BusinessPromoEditorScreen.tsx` — акции бизнеса
- [ ] `BusinessPlusSubscriptionScreen.tsx` — подписка Business+

### 3.8 Маркетплейс
- [ ] `Kuplu-Prodam.tsx` — листинг объявлений
- [ ] `CreateBuySellScreen.tsx` — создание объявления
- [ ] `Poisk-Raboty.tsx` — поиск работы
- [ ] `Kto-Poteryal.tsx` — потери/находки

### 3.9 Премиум
- [ ] `Podpiska-Premium.tsx` — экран подписки, цены, преимущества
- [ ] `PremiumGate.tsx` — корректное ограничение фич
- [ ] `BonusWalletScreen.tsx` — баланс, история транзакций
- [ ] `BonusPromotionPurchaseScreen.tsx` — покупка промо
- [ ] `PromoCreditsTopupScreen.tsx` — пополнение кредитов

---

## ЭТАП 4 — ЛОКАЛИЗАЦИЯ И КОНТЕНТ

### 4.1 Полный аудит переводов
- [ ] `src/i18n/translations.ts` — все ключи переведены на UA/RU/EN
- [ ] Поиск hardcoded русских/украинских строк в 106 экранах
- [ ] Поиск отображаемых EN-кодов категорий (напр. категории в `RequestItem.tsx`)
- [ ] `categories.ts` — все названия категорий локализованы
- [ ] Даты и числа — форматирование по локали

### 4.2 Контентная валидация
- [ ] `chaykaPlacesData.ts` — актуальность мест Чайки
- [ ] `buildings.ts` — справочник домов актуален
- [ ] `Vazhnye-Novosti-Chayki.tsx` — актуальные новости
- [ ] `Status-Sveta.tsx` — реальная интеграция с расписаниями отключений
- [ ] `Reyting-Domov.tsx` — корректный алгоритм рейтинга

### 4.3 Медиа и иконки
- [ ] `CustomIcons.tsx` — все иконки отображаются корректно
- [ ] Аватары: 6 вариантов (муж/жен × 3 возраста) — правильная матрица
- [ ] Изображения-заглушки для пустых состояний на всех экранах
- [ ] Splash screen и иконка приложения — актуальные

---

## ЭТАП 5 — ПРОИЗВОДИТЕЛЬНОСТЬ

### 5.1 Оптимизация загрузки
- [ ] `SplashAnimation.tsx` — не блокирует main thread
- [ ] `startupSync.ts` — минимальный набор данных при старте
- [ ] `StartupSyncBanner.tsx` — не мелькает при быстрой сети
- [ ] Cold start время — цель < 3 сек на Android mid-range

### 5.2 Кэширование
- [ ] `cacheLayer.ts` — TTL для каждого типа данных
- [ ] Изображения — `FastImage` или Expo Image с disk cache
- [ ] RTDB listeners — отписка при размонтировании компонента (memory leak)
- [ ] `stateSnapshotService.ts` — снапшоты не переполняют AsyncStorage

### 5.3 Пагинация и списки
- [ ] `Spisok-Zayavok.tsx` — `FlatList` с `getItemLayout`, `keyExtractor`
- [ ] `Lyudi-Chayki.tsx` — пагинация пользователей
- [ ] `Luchshiye-Mesta.tsx` — lazy loading карточек
- [ ] `WhoLikedMeList.tsx` — виртуализация длинных списков
- [ ] `SkeletonLoader.tsx` — применён на всех экранах с async-данными

### 5.4 Оптимизация Redux
- [ ] Selectors через `createSelector` (memoized) — все selectors в `selectors.ts`
- [ ] `useSelector` без создания новых объектов в каждом рендере
- [ ] Нет лишних re-render компонентов без изменения нужных данных

### 5.5 Оптимизация изображений
- [ ] `imageCompressor.ts` — применяется перед upload
- [ ] Max resolution: 1920px по длинной стороне
- [ ] WebP формат где поддерживается
- [ ] Progressive loading для фото-галерей

---

## ЭТАП 6 — СЕРВЕРНАЯ ЧАСТЬ (Firebase)

### 6.1 RTDB Правила безопасности
- [ ] Каждый путь — explicit allow/deny (нет `.read: true` без auth)
- [ ] Пользователь читает только свои данные там, где это нужно
- [ ] Валидация данных в правилах (`validate:`)
- [ ] Тест: unit-тесты через `@firebase/rules-unit-testing`
- [ ] Аудит зон 12-20 (из последнего коммита) — все 11 фиксов верифицированы

### 6.2 Storage Rules
- [ ] `storage.rules` — каждый namespace с UID-bound path
- [ ] Лимит размера файла в правилах (не только на клиенте)
- [ ] Типы файлов — whitelist (image/jpeg, image/png, image/webp)
- [ ] Публичные бакеты — намеренные, задокументированные

### 6.3 Cloud Functions
- [ ] `bonusFunctions.js` — атомарность транзакций с бонусами
- [ ] `inviteAccess.js` — инвайт-коды: одноразовые, с TTL
- [ ] `promotionFunctions.js` — защита от двойного списания
- [ ] Все функции: обработка ошибок, логирование, retry-логика
- [ ] Cold start функций — оптимизация (lazy imports)
- [ ] Node.js 22 — нет deprecated API

### 6.4 FCM Push-уведомления
- [ ] `fcmAPI` — отправка уведомлений работает
- [ ] `useFCMToken.ts` — обновление токена при сбросе
- [ ] `Nalashtuvannya-Spovishchen.tsx` — пользователь управляет типами уведомлений
- [ ] Foreground / background / quit state — все три сценария
- [ ] Уведомление → deep link → нужный экран

### 6.5 Remote Config
- [ ] `remoteConfig.ts` — получение конфига при старте
- [ ] Type validation после нормализации строковых boolean (из memory fix)
- [ ] Fallback значения для всех ключей
- [ ] Feature flags: `featureFlags.ts` — управление через Remote Config

### 6.6 Мониторинг и диагностика
- [ ] `crashReporting.ts` — Firebase Crashlytics подключён
- [ ] `runtimeMonitorService.ts` — метрики производительности
- [ ] `freezeWatchdogService.ts` — детектирование зависания UI
- [ ] `AdminRuntimeMonitorScreen.tsx` — dashboard для admin
- [ ] `ServerStatusScreen.tsx` — статус всех Firebase-сервисов

---

## ЭТАП 7 — МОДЕРАЦИЯ И БЕЗОПАСНОСТЬ КОНТЕНТА

### 7.1 Модерация фото
- [ ] `moderatorService.ts` — очередь модерации фото
- [ ] `ModerationPhotoCard.tsx` — интерфейс approve/reject
- [ ] `imageSafety.ts` — проверка безопасности изображений
- [ ] `ServiceModerationScreen.tsx` — сервисная модерация
- [ ] Метрики: среднее время модерации, бэклог

### 7.2 Модерация контента
- [ ] `censor.ts` — список запрещённых слов актуален
- [ ] `contentLanguageGuard.ts` — фильтр по языку
- [ ] `ContentComplaintModal.tsx` — жалобы пользователей
- [ ] `ReportBlockMenu.tsx` — блокировка пользователей
- [ ] `BlockReasonModal.tsx` — причины блокировки
- [ ] `reportBlockService.ts` — логирование жалоб в RTDB

### 7.3 Антиспам
- [ ] Rate limiting на создание заявок (не более N в сутки)
- [ ] Rate limiting на отправку сообщений в чат
- [ ] Дублирующиеся объявления в `Kuplu-Prodam` — детектирование
- [ ] Спам в комментариях — `CommentSection.tsx`

---

## ЭТАП 8 — СИСТЕМА УВЕДОМЛЕНИЙ И ОНБОРДИНГ

### 8.1 Онбординг новых пользователей
- [ ] `FirstLaunchOnboarding.tsx` — все слайды отображаются
- [ ] `LanguagePickerOnboarding.tsx` — выбор языка сохраняется
- [ ] `OnboardingSlides.tsx` — актуальный контент слайдов
- [ ] `InviteAccessIntroSlides.tsx` — поток приглашения понятен
- [ ] `GuestRegisterBanner.tsx` — CTA для незарегистрированных
- [ ] `TrainingHint.tsx` — подсказки не надоедают (показ только 1 раз)

### 8.2 Push-уведомления UX
- [ ] Запрос разрешений — момент и формулировка
- [ ] Группировка уведомлений по типу
- [ ] Бейдж на иконке приложения (iOS)
- [ ] Silent notifications для фоновой синхронизации

### 8.3 In-app уведомления
- [ ] `useSoftToast.ts` — toast messages на всех ключевых действиях
- [ ] `OfflineBanner.tsx` — корректное определение offline
- [ ] `ForceUpdateScreen.tsx` — принудительное обновление
- [ ] `MaintenanceScreen.tsx` — режим технических работ

---

## ЭТАП 9 — СПЕЦИФИЧЕСКИЕ ФИЧИ

### 9.1 Карта Чайки
- [ ] `Karta-Chayki.native.tsx` vs `Karta-Chayki.web.tsx` — паритет функций
- [ ] `PlaceMarker.tsx` — кластеризация маркеров при zoom out
- [ ] `mapFocusParams.ts` — фокус на нужное место при переходе
- [ ] `googleMapsLink.ts` — открытие в нативной карте
- [ ] Геолокация пользователя — запрос разрешений корректно

### 9.2 Система уровней и рейтингов
- [ ] `chaykaLevels.ts` — алгоритм начисления уровней
- [ ] `monthlyRating.ts` — ежемесячный сброс рейтинга
- [ ] `buildingRatingService.ts` — рейтинг домов
- [ ] `Reyting-Domov.tsx` — отображение топа домов
- [ ] `FeatureRatingBanner.tsx` — рейтинг фич приложения

### 9.3 Система поручителей
- [ ] `Poruchitel.tsx` — поток поручительства
- [ ] `isGuarantorComplete` — корректная валидация
- [ ] Dual source disconnect: `referrals` vs `trust_tree` — **НУЖНО ВЫБРАТЬ ОДИН ИСТОЧНИК** (из memory)
- [ ] `depthToRoot/rootPath` — корректное построение дерева доверия

### 9.4 Система бонусов
- [ ] `bonusService.ts` — начисление за действия
- [ ] `bonusQueue.ts` — атомарная обработка очереди
- [ ] `BonusWalletScreen.tsx` — история транзакций
- [ ] `chaykaLevels.ts` — конвертация бонусов в уровень
- [ ] Anti-fraud: нельзя накрутить бонусы (лимиты в Functions)

### 9.5 QR-коды
- [ ] `QR-Kod.tsx` — генерация QR для профиля/бизнеса
- [ ] Сканирование QR — переход на профиль пользователя
- [ ] Инвайт через QR

---

## ЭТАП 10 — ADMIN PANEL (Аудит, Редактирование, Визуальная полировка)

> **Скоуп:** Веб-панель администратора (`/admin-panel/`) — полный аудит функциональности, исправление багов, улучшение UX и визуального стиля.
> **Ограничение R-2:** изменения в admin panel не должны затрагивать архитектуру photo-upload на стороне мобильного приложения.

### 10.1 Инвентаризация Admin Panel
- [ ] Составить список всех разделов и страниц admin panel
- [ ] Выявить нерабочие / заглушенные разделы
- [ ] Проверить доступ: только admin-роль по `securityRoles.ts`
- [ ] Убедиться что `AdminRuntimeMonitorScreen.tsx` и `AppMonitorScreen.tsx` получают реальные данные
- [ ] Проверить `SecurityControlScreen.tsx` — управление блокировками/ролями

### 10.2 Аудит функциональности модерации
- [ ] **Модерация фото** — очередь, approve/reject, bulk-actions
- [ ] **Модерация заявок** — статусы, назначение модератора, история
- [ ] **Модерация контента** — жалобы пользователей, решения
- [ ] **ServiceModerationScreen.tsx** + **ServiceModerationIssuesScreen.tsx** — работа фильтров
- [ ] **UserErrorMonitorScreen.tsx** / **UserErrorModerationMonitorScreen.tsx** — отображение ошибок
- [ ] `ADMIN_PANEL_PERFORMANCE_AUDIT.md` — все пункты из аудита закрыты

### 10.3 Аудит управления пользователями
- [ ] Список пользователей — поиск, фильтрация по роли, статусу
- [ ] Блокировка / разблокировка пользователя
- [ ] Назначение/снятие ролей (moderator, admin) через `securityAdminService.ts`
- [ ] Просмотр профиля пользователя из admin
- [ ] История действий пользователя (audit log)
- [ ] `PromoCreditsAdminScreen.tsx` — выдача промо-кредитов работает

### 10.4 Аудит контентного управления
- [ ] Управление местами Чайки (`chaykaPlacesData.ts` → UI редактирования)
- [ ] Новости (`chaykaNewsService.ts`) — публикация, редактирование, удаление
- [ ] `OSBB-AddNews.tsx` — добавление новостей дома через admin
- [ ] Управление категориями объявлений
- [ ] Seed-данные (`foodSeed.ts`, `childrenSeed.ts`, `beautySeed.ts`) — ручной запуск из UI

### 10.5 Визуальная полировка Admin Panel
- [ ] **Единый дизайн-язык** — цвета, шрифты, отступы консистентны по всем страницам
- [ ] **Тёмная тема** — admin panel поддерживает тёмный режим
- [ ] **Адаптивность** — корректное отображение на 1280px, 1440px, 1920px
- [ ] **Навигация** — sidebar или top nav — чёткая иерархия разделов
- [ ] **Таблицы данных** — sortable columns, pagination, column resize
- [ ] **Статусные бейджи** — визуально различимые статусы (pending/approved/rejected/blocked)
- [ ] **Пустые состояния** — placeholder когда нет данных (не пустой экран)
- [ ] **Loading states** — skeleton или spinner на всех async операциях
- [ ] **Feedback actions** — toast/notification после каждого действия модератора
- [ ] **Клавиатурные шорткаты** — approve/reject без мыши для быстрой модерации

### 10.6 Производительность Admin Panel
- [ ] Большие списки (100+ пользователей) — виртуализация или серверная пагинация
- [ ] Фото-очередь — не загружает все изображения сразу (lazy load)
- [ ] Firebase RTDB listeners — отписка при переходе между разделами
- [ ] Кэш данных — повторный вход в раздел не вызывает полной перезагрузки

### 10.7 Совместимость и доступность Admin Panel
- [ ] Работает в Chrome 120+, Firefox 120+, Safari 17+
- [ ] Нет JS-ошибок в консоли при нормальном использовании
- [ ] `debug_test_photo_panel.md` — `ReferenceError в init()` — проверить что пофикшен
- [ ] `handleRefresh` — обновление всех секций включая BiznesChaika (из photo moderation audit)

---

## ЭТАП 11 — ТЕСТИРОВАНИЕ

### 11.1 Unit тесты
- [ ] Все utility-функции покрыты тестами (`src/utils/`)
- [ ] Firebase правила — тесты через `@firebase/rules-unit-testing`
- [ ] Redux slices — тесты reducers и selectors
- [ ] Services — мокирование Firebase, тесты бизнес-логики

### 11.2 Integration тесты
- [ ] Auth flow — регистрация → вход → выход
- [ ] Создание заявки → модерация → отображение
- [ ] Upload фото → модерация → одобрение (без нарушения R-2)
- [ ] Система бонусов — начисление → трата

### 11.3 E2E тесты (Detox / Maestro)
- [ ] Critical path: Login → Home → Create Request → Submit
- [ ] Critical path: Register → Avatar → Profile Setup → Home
- [ ] Critical path: Photo Upload → Moderation Queue
- [ ] Deep link: External URL → Correct Screen
- [ ] Admin Panel: Login → Moderation Queue → Approve Photo

### 11.4 Нагрузочное тестирование
- [ ] 100 одновременных пользователей в чате
- [ ] 50 одновременных загрузок фото
- [ ] RTDB listeners при большом объёме данных
- [ ] Cold start при заполненном кэше

---

## ЭТАП 12 — APK/IPA СБОРКА И РЕЛИЗ

### 12.1 Android
- [ ] Gradle build без ошибок (проверка smart quotes — фикс из memory)
- [ ] `SYSTEM_ALERT_WINDOW` permission — только для релизных сборок где нужно
- [ ] Crashlytics build ID — корректно встраивается (фикс из memory)
- [ ] Подпись APK — keystore актуален
- [ ] ProGuard/R8 — нет obfuscation-ошибок Firebase
- [ ] `app-version.json` — обновить перед каждым релизом
- [ ] Google Play target API level — соответствие требованиям 2026

### 12.2 iOS
- [ ] `expo-apple-authentication` — корректно на реальном устройстве
- [ ] Push Notifications entitlement — APS Environment: production
- [ ] Info.plist — все permission usage descriptions на UA/RU/EN
- [ ] TestFlight build — прохождение Apple Review

### 12.3 Web
- [ ] `Karta-Chayki.web.tsx` — Google Maps без нативных зависимостей
- [ ] Firebase Hosting — deploy через `firebase deploy:hosting`
- [ ] Admin panel — `/admin-panel/` — отдельный deploy
- [ ] PWA manifest — актуальный

### 12.4 OTA Updates (Expo Updates)
- [ ] Critical JS-фиксы без перерелиза в store
- [ ] Rollback механизм при проблемном обновлении
- [ ] `AppVersionInfoScreen.tsx` — отображает OTA-версию

---

## ЭТАП 13 — ДОКУМЕНТАЦИЯ И ПОДДЕРЖКА

### 13.1 Пользовательская документация
- [ ] `Spravka.tsx` — актуальная справка в приложении
- [ ] `Pro-Prilozhenie.tsx` — правильная версия, контакты
- [ ] `SupportScreen.tsx` — форма обратной связи работает
- [ ] FAQ по основным вопросам пользователей

### 13.2 Техническая документация
- [ ] README.md — актуальные инструкции по запуску
- [ ] `FIREBASE_PHOTO_RUNBOOK.md` — актуален
- [ ] `AI_MODERATION_SPEC.md` — актуален
- [ ] Архитектурная схема системы (Mermaid diagram)
- [ ] API-документация Firebase endpoints

### 13.3 Admin-документация
- [ ] Руководство модератора (фото, контент, заявки)
- [ ] Руководство по OSBB-администрированию
- [ ] Инструкция по созданию релиза APK
- [ ] Runbook для инцидентов
- [ ] Инструкция по работе с Admin Panel (визуальное руководство)

---

## ПРИОРИТЕТЫ (P0–P3)

### P0 — КРИТИЧЕСКИЕ (блокируют работу)
1. Viber auth bypass в `Kontakt-XXX` + `Bizznes-Chaika` — анонимные звонки
2. Upload фото без авторизации — любой может загрузить *(R-2: фикс только auth-проверки, не архитектуры)*
3. Dual source поручителей (`referrals` vs `trust_tree`) — данные не синхронизированы
4. Firebase rules — пути без auth проверки *(R-1: только корректировка существующих правил)*
5. JS ReferenceError в `init()` admin panel — обрывает loadPhotos (из debug memory)

### P1 — ВЫСОКИЙ ПРИОРИТЕТ (влияют на UX)
6. EN-коды категорий в `RequestItem.tsx` и `categories.ts`
7. Hardcoded строки без i18n в ключевых экранах
8. Memory leaks — RTDB listeners без отписки
9. Отсутствие skeleton loader на критических экранах
10. Admin Panel — нерабочие разделы / заглушки

### P2 — СРЕДНИЙ (улучшение качества)
11. Пагинация в длинных списках
12. Оптимизация холодного старта
13. Rate limiting антиспам
14. Unit тесты для бизнес-логики
15. Admin Panel — визуальный стиль (консистентность, таблицы, статусы)

### P3 — НИЗКИЙ (полировка)
16. Анимации переходов между экранами
17. Dark mode консистентность (мобайл + admin panel)
18. Accessibility (a11y) — screen reader support
19. Haptic feedback на тактильных кнопках
20. Admin Panel — клавиатурные шорткаты для быстрой модерации

---

## МЕТРИКИ УСПЕХА

| Метрика | Текущее | Цель |
|---|---|---|
| Cold start (Android) | ~4-5 сек | < 3 сек |
| Crash rate | ? | < 0.1% sessions |
| Auth success rate | ? | > 99% |
| Photo upload success | ? | > 98% |
| Push delivery rate | ? | > 95% |
| i18n coverage | ~70% | 100% |
| Firebase rules coverage | ~80% | 100% |
| Unit test coverage | ~20% | > 60% |
| Admin Panel — JS errors in console | существуют | 0 |
| Admin Panel — moderation action time | ? | < 2 сек |

---

## ГРАФИК РЕАЛИЗАЦИИ

| Этап | Описание | Длительность |
|---|---|---|
| 1 | Аудит и инвентаризация | 3 дня |
| 2 | Auth и безопасность (P0 фиксы) | 5 дней |
| 3 | UI/UX полировка всех экранов | 10 дней |
| 4 | Локализация и контент | 4 дня |
| 5 | Производительность | 5 дней |
| 6 | Серверная часть Firebase | 5 дней |
| 7 | Модерация и контент | 3 дня |
| 8 | Уведомления и онбординг | 3 дня |
| 9 | Специфические фичи | 5 дней |
| **10** | **Admin Panel — аудит, редактирование, визуал** | **8 дней** |
| 11 | Тестирование | 7 дней |
| 12 | Сборка и релиз | 3 дня |
| 13 | Документация | 3 дня |
| **ИТОГО** | | **~64 рабочих дня** |

---

## ФАЙЛОВАЯ КАРТА ПРОЕКТА

```
/src/
  screens/          106 экранов
  components/       70 компонентов
  services/         68 сервисов
  redux/slices/     11 слайсов
  hooks/            20 хуков
  contexts/         1 контекст
  navigation/       RootNavigator (~150 маршрутов)
  i18n/             UA/RU/EN переводы
  types/            Типизация
  data/             Справочные данные
  utils/            48 утилит
  photo-module/     Движок загрузки фото
  firebase-*.ts     Firebase конфиг и auth

/functions/         Cloud Functions (Node 22)
/admin-panel/       Веб-панель администратора
/firebase.rules.json    RTDB правила
/storage.rules          Storage правила
/app-version.json       Версионирование
/app.json               Expo конфиг
```

---

## СВЯЗАННЫЕ ДОКУМЕНТЫ

- `SECURITY_REPORT_2026-06-06.md` — аудит безопасности
- `AI_MODERATION_SPEC.md` — спецификация AI-модерации
- `BONUS_SYSTEM_AUDIT.md` — аудит системы бонусов
- `FIREBASE_PHOTO_RUNBOOK.md` — runbook фото-системы
- `ADMIN_PANEL_PERFORMANCE_AUDIT.md` — аудит admin-панели
- `AUDIT_TRANSLATIONS.md` — аудит переводов
- `PLAN-FEATURE-RATINGS.md` — план рейтинга фич
- `PLAN-TRUST-BONUSES-CURRENCY.md` — план бонусной системы

---

*Документ создан: 2026-06-27 | Обновлён: 2026-06-27 | Версия ТЗ: v1.1 | Версия приложения: 1.1.451 | Автор: ChaikaUA Team*
*Ограничения: R-1 (не создавать новых rules) | R-2 (не ломать photo upload) | R-3 (проверять зависимости) | R-4 (обратная совместимость Redux)*
