# Screen Checklist - мобильное приложение

Дата создания: 2026-07-01  
Источник: `src/navigation/RootNavigator.tsx`, `src/screens`, `src/photo-module`.

Статусы:

- `Not started` - экран еще не проходили.
- `Static reviewed` - проверен код/guards/dependencies.
- `Manual passed` - ручной проход успешен.
- `Issue found` - есть finding.
- `Blocked` - нельзя проверить без данных/окружения.

## Общая проверка для каждого экрана

Для каждого экрана отмечать:

- открывается ли экран без crash;
- правильный access guard: guest/auth/complete/moderator/admin;
- loading state;
- empty state;
- network error/offline state;
- permission-denied state;
- Android back behavior;
- deep link behavior, если маршрут есть в linking config;
- маленький экран 360x640;
- длинные строки/имена/адреса;
- фото/media fallback;
- double tap/повторная отправка;
- форма не отправляет invalid payload;
- нет приватных данных у гостя/обычного пользователя;
- ошибки понятны пользователю.

## P0/P1 smoke journeys

| ID | Journey | Status | Notes |
| --- | --- | --- | --- |
| SJ-001 | Первый запуск -> onboarding/language -> home | Not started | Проверить bootstrapping и persisted state |
| SJ-002 | Login -> profile setup -> main tabs | Not started | Включая avatar requirement |
| SJ-003 | Guest opens protected action -> Login redirect -> return | Not started | Request/photo/contact flows |
| SJ-004 | Create request with no photo | Not started | Validate rules and UI feedback |
| SJ-005 | Create request with photo | Not started | Upload + DB write consistency |
| SJ-006 | View request -> comment/profile/contact | Not started | Profile privacy and auth |
| SJ-007 | Photo upload -> pending -> approved/rejected visibility | Not started | Storage + DB + moderation |
| SJ-008 | Moderator screens access | Not started | Moderator role only |
| SJ-009 | Admin-only mobile diagnostics access | Not started | Admin role only |
| SJ-010 | Offline/slow Firebase startup | Not started | No infinite splash/loading |
| SJ-011 | Permission denied on read/write | Not started | User-facing message quality |
| SJ-012 | APK version/force update flow | Not started | `ForceUpdateScreen`/version service |

## Navigation-level guard summary

| Guard | Routes |
| --- | --- |
| `auth` | `HelpHistoryScreen`, `MyRequestsScreen`, `UserErrorMonitorScreen`, `AuthDiagnosticScreen`, `EditProfileScreen`, `OsbbSetupScreen`, `OsbbAddNewsScreen`, `OsbbAdminScreen`, `NotificationSettingsScreen`, `AppMonitorScreen`, `BonusWalletScreen`, `PromoCreditsTopupScreen`, `BonusPromotionPurchaseScreen`, `EditContactListingScreen`, `BusinessClaimScreen`, `BusinessPlusSubscriptionScreen`, `BusinessMenuEditorScreen`, `BusinessPromoEditorScreen` |
| `complete` | `RequestFormScreen`, `CreateBuySellScreen` |
| `moderator` | `PhotoModerationScreen`, `ServiceModerationScreen`, `UserErrorModerationMonitorScreen`, `ServiceModerationIssuesScreen` |
| `admin` | `AdminRuntimeMonitorScreen`, `AdminUserErrorsScreen`, `ServerStatusScreen`, `SecurityControlScreen`, `PromoCreditsAdminScreen` |
| no `withGuard` | all other public or internally guarded routes |

High-priority routes without navigation-level `withGuard` but likely requiring scrutiny:

- `ProfileRequestsScreen` - has internal auth gate, still verify data reads before gate.
- `ContactCardChatScreen` - uses current user; verify direct route/deep link cannot read/send without auth.
- `MyPhotosScreen` - uses Firebase auth/session; verify guest behavior.
- `MyApprovedPhotosScreen` - uses Firebase auth/session; verify guest behavior.
- `PhotoUploadScreen` - reachable via deep link `screen/photo-upload`; verify guest/direct route behavior.
- `FavoritesScreen` - verify private favorites are not exposed without auth.
- `InboxScreen` - verify private notifications/messages are not exposed without auth.

## Deep links from linking config

| Route | Path | Status | Notes |
| --- | --- | --- | --- |
| `HomeTab` | `screen/home` | Not started | Main tab |
| `MapTab` | `screen/map` | Not started | Main tab |
| `HelpTab` | `screen/help` | Not started | Main tab |
| `ServicesTab` | `screen/services` | Not started | Main tab |
| `ProfileTab` | `screen/profile` | Not started | Main tab |
| `OnlineChatList` | `screen/chat` | Not started | Chat |
| `RequestFormScreen` | `screen/request-form` | Not started | Complete guard |
| `HelpNeighborsScreen` | `screen/help-neighbors` | Not started | Public/list |
| `HelpHistoryScreen` | `screen/help-history` | Not started | Auth guard |
| `MyRequestsScreen` | `screen/my-requests` | Not started | Auth guard |
| `PlacesScreen` | `screen/places/:tab?` | Not started | Parameterized |
| `SubscriptionScreen` | `screen/premium` | Not started | Public premium page |
| `RatingScreen` | `screen/rating` | Not started | Public/read + voting guard |
| `BuildingRatingDetailScreen` | `screen/rating/building/:buildingId` | Not started | Requires valid id |
| `EditProfileScreen` | `screen/profile/edit` | Not started | Auth guard |
| `OsbbHubScreen` | `screen/osbb` | Not started | OSBB entry |
| `OsbbSborScreen` | `screen/osbb/collections` | Not started | OSBB collections |
| `OsbbGolosuvannyaScreen` | `screen/osbb/voting` | Not started | Voting |
| `OsbbFinansyScreen` | `screen/osbb/finance` | Not started | Finance/privacy risk |
| `OsbbNovostyScreen` | `screen/osbb/news` | Not started | News |
| `NotificationSettingsScreen` | `screen/notifications` | Not started | Auth guard |
| `MyPhotosScreen` | `screen/my-photos` | Not started | No nav guard, verify internal guard |
| `SoulPhotosScreen` | `screen/foto-dlya-dushi` | Not started | Gallery |
| `FotoRayonaScreen` | `screen/foto-rayona` | Not started | Gallery/upload entry |
| `PhotoUploadScreen` | `screen/photo-upload` | Not started | No nav guard, verify direct access |
| `StartAvatarPickerScreen` | `screen/start-avatar` | Not started | Registration/profile setup |
| `BizznesChaikaScreen` | `screen/business/chaika` | Not started | Listings |
| `VseDlyaDeteyScreen` | `screen/kids` | Not started | Kids places/offers |
| `DetalDetskogoMestaScreen` | `screen/kids/place` | Not started | Requires params |
| `DetalDetskogoPredlozheniyaScreen` | `screen/kids/offer` | Not started | Requires params |
| `SalonyKrasotyScreen` | `screen/beauty` | Not started | Beauty places/offers |
| `DetalSalonaScreen` | `screen/beauty/place` | Not started | Requires params |
| `DetalPredlozheniyaSalonaScreen` | `screen/beauty/offer` | Not started | Requires params |
| `SportNaChaykeScreen` | `screen/sports` | Not started | Sport list |
| `SportDetailScreen` | `screen/sports/detail` | Not started | Requires params |
| `EdaNaChaykeScreen` | `screen/food` | Not started | Food hub |
| `SpisokPokupokScreen` | `screen/food/shopping` | Not started | Shopping list |
| `CrashDiagnosticsScreen` | `screen/crash-diagnostics` | Not started | Public route, verify sensitivity |
| `AppMonitorScreen` | `screen/app-monitor` | Not started | Auth guard |
| `BonusWalletScreen` | `screen/bonus-wallet` | Not started | Auth guard |
| `PromoCreditsTopupScreen` | `screen/promo-credits-topup` | Not started | Auth guard |
| `PromoCreditsAdminScreen` | `screen/admin/promo-credits` | Not started | Admin guard |
| `BonusPromotionPurchaseScreen` | `screen/bonus-promotion` | Not started | Auth guard |
| `CreateBuySellScreen` | `screen/buy-sell/create` | Not started | Complete guard |
| `InboxScreen` | `screen/inbox` | Not started | No nav guard, verify internal guard |
| `ContactCardChatScreen` | `screen/contact-card-chat` | Not started | No nav guard, requires params/user |

## Screen matrix

| Group | Route | File | Guard | Status | Priority notes |
| --- | --- | --- | --- | --- | --- |
| Main | `MainTabs` | `RootNavigator.tsx` | public | Not started | Tab state/back behavior |
| Main | `HomeTab` | `Glavny-Ekran.tsx` | public | Not started | Startup navigation, cards |
| Main | `MapTab` | `Karta-Chayki.tsx` | public | Not started | Native/web split, permissions |
| Main | `HelpTab` | `Vibor-Temy-Zayavki.tsx` | public | Not started | Entry to request form |
| Main | `ServicesTab` | `servicesHub.tsx` | public | Not started | Service links |
| Main | `ProfileTab` | `Profil-Polzovatelya.tsx` | public/internal | Not started | Guest vs logged-in menu |
| Auth | `LoginScreen` | `Vkhod.tsx` | public | Not started | Login, redirects, profile setup |
| Auth | `RegisterScreenFull` | `Registraciya-Polnaya.tsx` | public | Not started | Full registration validation |
| Auth | `StartAvatarPickerScreen` | `StartAvatarPickerScreen.tsx` | public/setup | Not started | Redirect params |
| Auth | `ProfileSetupScreen` | `ProfileSetupScreen.tsx` | internal | Not started | Required avatar/gender/age |
| Auth | `AccessRestrictedScreen` | `AccessRestrictedScreen.tsx` | state screen | Not started | Not in stack, verify usage |
| Auth | `PendingApprovalScreen` | `PendingApprovalScreen.tsx` | state screen | Not started | Not in stack, verify usage |
| Requests | `RequestTopicScreen` | `Vibor-Temy-Zayavki.tsx` | public | Not started | Topic selection |
| Requests | `RequestFormScreen` | `Forma-Zayavki.tsx` | complete | Not started | Form validation, double submit |
| Requests | `RequestsScreen` | `Spisok-Zayavok.tsx` | public | Not started | List, filters, detail |
| Requests | `RequestDetail` | `Detal-Zayavki.tsx` | public/internal | Not started | Comments/profile privacy |
| Requests | `HelpNeighborsScreen` | `Pomoch-Sosedyam.tsx` | public | Not started | Help feed |
| Requests | `HelpRequestScreen` | `Zapros-Pomoshi.tsx` | public/internal | Not started | Help response |
| Requests | `MyRequestsScreen` | `Moi-Zayavki.tsx` | auth | Not started | User-owned data |
| Requests | `HelpHistoryScreen` | `Istoriya-Zaprosov.tsx` | auth | Not started | History privacy |
| Places | `PlacesScreen` | `Mesta-Chayki.tsx` | public | Not started | Tabs/filter/map focus |
| Places | `ListScreen` | `Spisok-Mest.tsx` | public | Not started | Legacy/list route |
| Places | `PlaceDetailsPanel` | `Panel-Detaley-Mesta.tsx` | public | Not started | Param safety |
| Places | `TopPlacesScreen` | `Luchshiye-Mesta.tsx` | public | Not started | Ranking |
| Places | `TopCafeScreen` | `Top-Kafe.tsx` | public | Not started | Map focus |
| Places | `TopStoresScreen` | `Top-Magaziny.tsx` | public | Not started | Map focus |
| Places | `InterestingPlacesScreen` | `Interesnye-Mesta.tsx` | public | Not started | Map links |
| Social | `TopGirlsBoysScreen` | `Lyudi-Chayki.tsx` | public/internal | Not started | Profile privacy, avatars |
| Social | `KontaktiChaikyScreen` | `Kontakt-XXX.tsx` | public/internal | Not started | Contact listings |
| Social | `OnlineChatTab` | `Onlayn-Chat.tsx` | public/internal | Not started | Chat list |
| Social | `OnlineChatList` | `Onlayn-Chat.tsx` | public/internal | Not started | Nested route |
| Social | `ViewUserProfile` | `ViewUserProfileScreen.tsx` | public/internal | Not started | Privacy permissions |
| Social | `ProfileRequestsScreen` | `ProfileRequestsScreen.tsx` | internal auth gate | Not started | Verify no reads before auth |
| Social | `ContactCardChatScreen` | `ContactCardChatScreen.tsx` | no nav guard | Not started | Verify direct route auth/params |
| Social | `InboxScreen` | `InboxScreen.tsx` | no nav guard | Not started | Verify private data guard |
| Media | `SoulPhotosScreen` | `Foto-Dlya-Dushi.tsx` | public | Not started | Gallery |
| Media | `FotoRayonaScreen` | `Foto-Rayona.tsx` | public | Not started | Upload entry guest guard |
| Media | `PhotoUploadScreen` | `Zagruzka-Foto.tsx` | no nav guard | Not started | Direct link upload/auth |
| Media | `MyPhotosScreen` | `photo-module/MyPhotosScreen.tsx` | no nav guard | Not started | User photos privacy |
| Media | `MyApprovedPhotosScreen` | `MyApprovedPhotosScreen.tsx` | no nav guard | Not started | Approved photos privacy |
| Media | `PhotoModerationScreen` | `Moderaciya-Foto.tsx` | moderator | Not started | Encoding issue, moderator access |
| OSBB | `OsbbHubScreen` | `OSBB-Hub.tsx` | public/internal | Not started | Hub cards |
| OSBB | `OsbbSborScreen` | `OSBB-Sbor.tsx` | public/internal | Not started | Collections |
| OSBB | `OsbbGolosuvannyaScreen` | `OSBB-Golosovanie.tsx` | public/internal | Not started | Voting rules |
| OSBB | `OsbbFinansyScreen` | `OSBB-Finansy.tsx` | public/internal | Not started | Finance privacy |
| OSBB | `OsbbNovostyScreen` | `OSBB-Novosti.tsx` | public/internal | Not started | News edit links |
| OSBB | `OsbbSetupScreen` | `OSBB-Setup.tsx` | auth | Not started | Setup permissions |
| OSBB | `OsbbAddNewsScreen` | `OSBB-AddNews.tsx` | auth | Not started | Add/edit permissions |
| OSBB | `OsbbAdminScreen` | `OSBB-AdminPanel.tsx` | auth | Not started | Verify if admin/member required |
| Commerce | `BuySellScreen` | `Kuplu-Prodam.tsx` | public/internal | Not started | Listings and create link |
| Commerce | `CreateBuySellScreen` | `CreateBuySellScreen.tsx` | complete | Not started | Form validation |
| Commerce | `JobSearchScreen` | `Poisk-Raboty.tsx` | public | Not started | Contact/profile privacy |
| Commerce | `LostAndFoundScreen` | `Kto-Poteryal.tsx` | public/internal | Not started | Create action auth |
| Commerce | `AnnouncementsScreen` | `Obyavleniya.tsx` | public | Not started | Links |
| Content | `ImportantNewsScreen` | `Vazhnye-Novosti-Chayki.tsx` | public | Not started | Dynamic route links |
| Content | `ChaikaProblemsScreen` | `Problemy-Chayki.tsx` | public/internal | Not started | Photos/auth prompts |
| Content | `ItemDetailScreen` | `ItemDetailScreen.tsx` | public/internal | Not started | Generic detail, many actions |
| Business | `BizznesChaikaScreen` | `Bizznes-Chaika.tsx` | public/internal | Not started | Listings/profile |
| Business | `BusinessClaimScreen` | `BusinessClaimScreen.tsx` | auth | Not started | Claim ownership |
| Business | `BusinessPlusSubscriptionScreen` | `BusinessPlusSubscriptionScreen.tsx` | auth | Not started | Subscription |
| Business | `BusinessMenuEditorScreen` | `BusinessMenuEditorScreen.tsx` | auth | Not started | Owner/admin permissions |
| Business | `BusinessPromoEditorScreen` | `BusinessPromoEditorScreen.tsx` | auth | Not started | Owner/admin permissions |
| Premium | `SubscriptionScreen` | `Podpiska-Premium.tsx` | public/internal | Not started | Purchase/support |
| Premium | `BonusWalletScreen` | `BonusWalletScreen.tsx` | auth | Not started | Balance privacy |
| Premium | `PromoCreditsTopupScreen` | `PromoCreditsTopupScreen.tsx` | auth | Not started | Topup flow |
| Premium | `PromoCreditsAdminScreen` | `PromoCreditsAdminScreen.tsx` | admin | Not started | Admin only |
| Premium | `BonusPromotionPurchaseScreen` | `BonusPromotionPurchaseScreen.tsx` | auth | Not started | Purchase validation |
| Categories | `VseDlyaDeteyScreen` | `Vse-Dlya-Detey.tsx` | public | Not started | Kids categories |
| Categories | `DetalDetskogoMestaScreen` | `Detal-Detskogo-Mesta.tsx` | public | Not started | Param/business claim |
| Categories | `DetalDetskogoPredlozheniyaScreen` | `Detal-Detskogo-Predlozheniya.tsx` | public | Not started | Param safety |
| Categories | `SalonyKrasotyScreen` | `Salony-Krasoty.tsx` | public | Not started | Beauty categories |
| Categories | `DetalSalonaScreen` | `Detal-Salona.tsx` | public | Not started | Param/business claim |
| Categories | `DetalPredlozheniyaSalonaScreen` | `Detal-Predlozheniya-Salona.tsx` | public | Not started | Param safety |
| Categories | `SportNaChaykeScreen` | `Sport-Na-Chayke.tsx` | public | Not started | Sport list |
| Categories | `SportDetailScreen` | `Sport-Detal.tsx` | public | Not started | Required params |
| Categories | `EdaNaChaykeScreen` | `Eda-Na-Chayke.tsx` | public | Not started | Food list |
| Categories | `SpisokPokupokScreen` | `Spisok-Pokupok.tsx` | public/internal | Not started | Shopping list |
| Profile | `EditProfileScreen` | `EditProfileScreen.tsx` | auth | Not started | Save validation |
| Profile | `FavoritesScreen` | `FavoritesScreen.tsx` | no nav guard | Not started | Verify private favorites guard |
| Profile | `PoruchitelScreen` | `Poruchitel.tsx` | public/internal | Not started | Trust/sponsor logic |
| Info | `HelpScreen` | `Spravka.tsx` | public | Not started | Links to protected screens |
| Info | `SupportScreen` | `SupportScreen.tsx` | public/internal | Not started | Support ticket privacy |
| Info | `AppInfoScreen` | `Pro-Prilozhenie.tsx` | public | Not started | Version links |
| Info | `AppVersionInfoScreen` | `AppVersionInfoScreen.tsx` | public | Not started | Release info |
| Info | `QRCodeScreen` | `QR-Kod.tsx` | public | Not started | QR data |
| Info | `DownloadCodeScreen` | `Ekran-Koda-Zagruzki.tsx` | public | Not started | APK/update |
| Diagnostics | `ServiceModerationScreen` | `ServiceModerationScreen.tsx` | moderator | Not started | Encoding issue, links to admin screens |
| Diagnostics | `ServiceModerationIssuesScreen` | `ServiceModerationIssuesScreen.tsx` | moderator | Not started | Params |
| Diagnostics | `UserErrorModerationMonitorScreen` | `UserErrorModerationMonitorScreen.tsx` | moderator | Not started | Error privacy |
| Diagnostics | `UserErrorMonitorScreen` | `UserErrorMonitorScreen.tsx` | auth | Not started | Own errors only |
| Diagnostics | `AdminRuntimeMonitorScreen` | `AdminRuntimeMonitorScreen.tsx` | admin | Not started | Sensitive logs |
| Diagnostics | `AdminUserErrorsScreen` | `AdminUserErrorsScreen.tsx` | admin | Not started | Sensitive logs |
| Diagnostics | `ServerStatusScreen` | `ServerStatusScreen.tsx` | admin | Not started | Server info |
| Diagnostics | `SecurityControlScreen` | `admin/SecurityControlScreen.tsx` | admin | Not started | Security controls |
| Diagnostics | `AuthDiagnosticScreen` | `AuthDiagnosticScreen.tsx` | auth | Not started | Sensitive session info |
| Diagnostics | `CrashDiagnosticsScreen` | `CrashDiagnosticsScreen.tsx` | public | Not started | Verify no sensitive logs |
| Diagnostics | `AppMonitorScreen` | `AppMonitorScreen.tsx` | auth | Not started | Links to diagnostics |
| Settings | `NotificationSettingsScreen` | `Nalashtuvannya-Spovishchen.tsx` | auth | Not started | FCM permissions |
| Section | `SectionScreen` | `Razdel.tsx` | public | Not started | Generic section |

