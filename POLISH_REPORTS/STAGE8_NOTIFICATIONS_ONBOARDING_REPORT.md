# STAGE 8 — NOTIFICATIONS & ONBOARDING: REPORT
## Date: 2026-06-27

---

## FIXES APPLIED (5 code changes across 5 files)

### FIX-1: ForceUpdateScreen.tsx — iOS/web users stuck — HIGH
**File:** `src/components/ForceUpdateScreen.tsx:87-93`
**Was:** Only Android APK download/install flow; iOS/web users see Download button that does nothing
**Now:** Platform.OS check:
- iOS → `Linking.openURL(config.iosUrl)` (App Store)
- Web → `Linking.openURL(config.webUrl || config.landingUrl)`
- Android → existing APK flow (unchanged)

### FIX-2: MaintenanceScreen.tsx default language — MEDIUM
**File:** `src/components/MaintenanceScreen.tsx:45`
**Was:** `(state.language?.current ?? 'ru')` — Ukrainian users see Russian maintenance screen
**Now:** `'ua'` — consistent with rest of app

### FIX-3: FirstLaunchOnboarding.tsx caption lookup — MEDIUM
**File:** `src/components/FirstLaunchOnboarding.tsx:115-121`
**Was:** `SLIDES.findIndex((item) => item.key === slide.key)` inside `.map()` — O(n^2), returns -1 if key missing → `undefined` caption
**Now:** Uses `(slide, slideIndex)` map parameter directly — O(n), always correct index

### FIX-4: InviteAccessIntroSlides.tsx i18n — MEDIUM
**File:** `src/components/InviteAccessIntroSlides.tsx`
**Was:** Hardcoded Ukrainian: `'Продовжити'`, `'Далі'`, `'Гортайте вліво...'`
**Now:** Full ua/ru/en support via `useSelector(state.language)` + TEXT object

### FIX-5: Nalashtuvannya-Spovishchen.tsx double permission — MEDIUM
**File:** `src/screens/Nalashtuvannya-Spovishchen.tsx:191-193`
**Was:** `fcmAPI.registerToken()` (requests permission internally) then immediately `Notifications.requestPermissionsAsync()` — double permission popup
**Now:** Uses token presence from `registerToken()` as grant indicator; no redundant second call

---

## AUDIT RESULTS (no changes needed)

| Component | Status | Notes |
|---|---|---|
| LanguagePickerOnboarding.tsx | PASS | Clean, saves language correctly |
| GuestRegisterBanner.tsx | PASS | Route `RegisterScreenFull` confirmed in RootNavigator |
| useSoftToast.ts | PASS | Clean hook with localization fallbacks |
| OfflineBanner.tsx | PASS | `pointerEvents="none"` prevents touch blocking |
| TrainingHint.tsx | PASS | Spring animation, simple dismiss |
| OnboardingSlides.tsx | OK | Shared fadeAnim minor (single slide visible at a time) |
| useFCMToken.ts | OK | `trigger: null` works in current Expo SDK version |

## KNOWN ISSUES (not fixed — require architectural decisions)

| # | Issue | File | Severity |
|---|---|---|---|
| 1 | `trigger: null` deprecated in newer expo-notifications SDK | useFCMToken.ts:64 | LOW (works in current SDK) |
| 2 | Only `comments` pref synced to RTDB; others local-only | Nalashtuvannya-Spovishchen.tsx:177 | LOW (design decision) |
| 3 | Comment cooldown client-side only | CommentSection.tsx:74 | LOW (rate limiter in AsyncStorage) |
| 4 | ForceUpdateScreen `'downloaded'` status never reached | ForceUpdateScreen.tsx:11 | LOW (dead code, harmless) |

---

## VERIFICATION

- TypeScript compilation: PASS (0 errors)
- Rule R-1: PASS (no Firebase rules changed)
- Rule R-2: PASS (photo architecture untouched)
- Rule R-3: PASS (new imports: useSelector, RootState in InviteAccessIntroSlides)
- Rule R-4: PASS (no Redux changes)

---

*Stage 8 completed: 2026-06-27*
