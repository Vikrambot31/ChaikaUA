# DAY 4 REPORT: FOTO-SISTEMA, ZAGRUZKA, MODERATSIYA, GALEREYA
## Data: 2026-06-08

---

## OBSHCHIY ITOG

| Kategoriya | Kolichestvo |
|------------|-------------|
| **CRITICAL** | 1 |
| **HIGH** | 5 |
| **MEDIUM** | 5 |
| **LOW** | 0 (ne ishchem) |
| **Vsego** | 11 |

---

## BUG-4.1: photoAPI.moderatePhoto NE proveryayet roli moderatora

- **Severity:** CRITICAL
- **Fayl:** `src/firebase-config.ts`
- **Stroka:** 1373-1433
- **Funktsiya:** `moderatePhoto()`
- **Problema:** Funktsiya `moderatePhoto` vyzyvayet tolko `ensureFirebaseAuth()`, no NE proveryayet, yavlyayetsya li polzovatel moderatorom (`isModeratorUser()`). Lyuboy avtorizovannyy polzovatel mozhet sozdat pryamoy vyzov k etoy funktsii i odobrit/otklonit lyuboye foto.
- **Kod:**
```typescript
// firebase-config.ts:1373-1378
moderatePhoto: async (photoId: string, status: 'approved' | 'rejected'): Promise<ApiVoidResult> => {
  try {
    const user: FirebaseUser = await ensureFirebaseAuth(); // <- tolko auth, NET proverki moderatora!
    if (!photoId || (status !== 'approved' && status !== 'rejected')) {
```
- **Ozhidaemoe povedenie:** Pered vypolneniyem moderatsii dolzhna byt proverka roli: `if (!(await isModeratorUser())) throw new Error('access denied')`
- **Fakticheskoye povedenie:** Lyuboy avtorizovannyy polzovatel mozhet moderirovat foto
- **Kak vosproizvesti:** 1. Zayti v prilozheniye kak obychnyy polzovatel. 2. Pryamo vyzvat `photoAPI.moderatePhoto()` cherez konsol. 3. Foto budet odobreno/otkloneno bez prav moderatora.
- **Rekomendatsiya:** Dobavit proverku `isModeratorUser()` v nachale `moderatePhoto`.

---

## BUG-4.2: Posle odobreniya foto NE kopiruyetsya v community_photos_public

- **Severity:** HIGH
- **Fayl:** `src/firebase-config.ts`
- **Stroka:** 1408-1423
- **Funktsiya:** `moderatePhoto()`
- **Problema:** Pri odobrenii foto (status='approved') kod obnovlyayet tolko zapis v `community_photos/{photoId}`, no NE sozdayot kopiyu v `community_photos_public`. Eto oznachayet, chto vse ekrany, kotoryye chitayut iz `community_photos_public`, ne uvidyat odobrennyye foto.
- **Kod:**
```typescript
// firebase-config.ts:1408-1423
await update(ref(database, `community_photos/${photoId}`), {  // <- tolko community_photos
  status,
  moderatedAt: Date.now(),
  moderatedBy: user.uid,
  moderationReason: status === 'rejected' ? 'default_rejected' : null,
  rejectionReason: status === 'rejected' ? 'default_rejected' : null,
  ...safetyUpdate,
});
// NET sozdaniya zapisi v community_photos_public!
```
- **Ozhidaemoe povedenie:** Pri approve nuzhno skopirovat dannye v `community_photos_public/{photoId}` (ili sozdat otdelnuyu zapis).
- **Fakticheskoye povedenie:** Zapis sozdayetsya tolko v `community_photos`. `community_photos_public` ostaetsya pustym.
- **Kak vosproizvesti:** 1. Admin odobryayet foto v Moderaciya-Foto. 2. Proverit `community_photos_public` v Firebase — zapis otsutstvuyet. 3. Ekrany chitayushchiye iz `community_photos_public` (naprimer `getPhotosOnce` dlya nemoderatorov) ne pokazhut eto foto.
- **Rekomendatsiya:** Dobavit logiku sozdaniya/kopirovaniya zapisi v `community_photos_public` posle approve.

---

## BUG-4.3: Foto-Dlya-Dushi i Foto-Rayona chitayut iz community_photos vmesto community_photos_public

- **Severity:** HIGH
- **Fayly:** `src/screens/Foto-Dlya-Dushi.tsx:207`, `src/screens/Foto-Rayona.tsx:155`
- **Funktsiya:** `SoulPhotosScreen`, `FotoRayonaScreen`
- **Problema:** Oba ekrana chitayut iz `community_photos` (soderzhit VSE foto vklyuchaya otklonennyye i chuzhiye pending), a zatem filtriruyut na storone klienta. Pravilnyy podkhod — chitat iz `community_photos_public`, gde dolzhny byt tolko odobrennyye foto.
- **Kod:**
```typescript
// Foto-Dlya-Dushi.tsx:207
const photosQuery = query(ref(database, 'community_photos'), orderByChild('sourceScreen'), equalTo(SCREEN_ID));
// Foto-Rayona.tsx:155
const photosRef = ref(database, 'community_photos');
```
- **Ozhidaemoe povedenie:** Chitat iz `community_photos_public` dlya publichnykh galerey.
- **Fakticheskoye povedenie:** Chteniye iz `community_photos`, filtratsiya na kliente.
- **Rekomendatsiya:** Smenit put na `community_photos_public`. Uchityvat, chto BUG-4.2 neobkhodimo ispravit, chtoby `community_photos_public` soderzhala dannyye.

---

## BUG-4.4: MyApprovedPhotosScreen chitayet iz community_photos vmesto community_photos_public

- **Severity:** HIGH
- **Fayl:** `src/screens/MyApprovedPhotosScreen.tsx:167`
- **Funktsiya:** MyApprovedPhotosScreen
- **Problema:** Ekran "Moi odobrennyye foto" chitayet iz `community_photos`. Eto izvestnaya problema (ukazana v `AGENT_SYSTEM_PROMPT.md` kak izvestnyy bag #5). Ekran dolzhen chitat iz `community_photos_public`, t.k. on pokazyvayet TOLKO odobrennyye foto.
- **Kod:**
```typescript
// MyApprovedPhotosScreen.tsx:167
const dbRef = ref(database, 'community_photos');  // <- nepravilnaya kollektsiya
```
- **Ozhidaemoe povedenie:** Chitat iz `community_photos_public`.
- **Fakticheskoye povedenie:** Chitayet iz `community_photos`, zatem filtriruyet po uid i statusu.
- **Rekomendatsiya:** Smenit na `community_photos_public`. Odnovremenno ispravit BUG-4.2.

---

## BUG-4.5: V galereyakh net vozmozhnosti otkryt foto na ves ekran (preview)

- **Severity:** HIGH
- **Fayly:** `src/screens/Foto-Dlya-Dushi.tsx:138`, `src/screens/Foto-Rayona.tsx:101`
- **Komponent:** `SoulTile`
- **Problema:** Pri nazhatii na foto v galereye nichego ne proiskhodit. Komponent `SoulTile` ne imeyet `onPress` i ne yavlyayetsya `TouchableOpacity`. Polzovatel ne mozhet posmotret foto v uvelichennom vide.
- **Kod:**
```typescript
// Foto-Dlya-Dushi.tsx:152-183
const SoulTile = memo(function SoulTile({ item, size, pendingLabel, uploadLabel }) {
  return (
    <View style={[styles.tile, ...]}> // <- prostoy View, NET onPress
      {item.uri ? (
        <AppPhotoImage ... />  // <- net obrabotchika nazhatiya
      ) : null}
      // ...
    </View>
  );
});
```
- **Ozhidaemoe povedenie:** Pri nazhatii na foto dolzhno otkryvatsya modalnoye okno s uvelichennym izobrazheniyem.
- **Fakticheskoye povedenie:** Nazhatiye na foto igniruyetsya.
- **Rekomendatsiya:** Dobavit `TouchableOpacity` ili `onPress` k `SoulTile`, kotoryy otkryvayet modal s preview.

---

## BUG-4.6: Neskolko konkuriruyushchikh servisov zagruzki foto

- **Severity:** HIGH
- **Fayly:** `src/services/photoService.ts`, `src/services/photoUploadService.ts`, `src/services/unifiedPhotoUpload.ts`, `src/components/PhotoUploadField.tsx`, `src/screens/Zagruzka-Foto.tsx`
- **Problema:** V sisteme sushchestvuyut 3 razlichnykh mekhanizma zagruzki foto:
  1. `PhotoUploadField` → `UploadQueue` (lokalnoye khranilishche + ochered)
  2. `Zagruzka-Foto.tsx` → `photoAPI.addPhoto` (pryamaya zapis v RTDB)
  3. `photoService.ts` → `unifiedPhotoUpload` → `photoUploadService` (polnyy pipeline)

  Eto mozhet privesti k tomu, chto odin i tot zhe fayl budet zagruzhen cherez raznyye puti s raznoy logikoy, raznymi proverkami i raznym povedeniyem pri oshibkakh.
- **Ozhidaemoe povedeniye:** Yedinyy servis zagruzki dlya vsekh foto.
- **Fakticheskoye povedeniye:** Neskolko peresekayushchikhsya servisov.
- **Rekomendatsiya:** Unifitsirovat vse zagruzki cherez edinyy servis i udalit duble.

---

## BUG-4.7: V galereye ne otobrazhayetsya informatsiya o foto (avtor, laiki, data)

- **Severity:** MEDIUM
- **Fayly:** `src/screens/Foto-Dlya-Dushi.tsx:91-100`, `src/screens/Foto-Rayona.tsx:68-73`
- **Tip:** `SoulPhoto`
- **Problema:** Tip `SoulPhoto` soderzhit tolko `id`, `uri`, `storagePath`, `createdAt`, `status`. V nyem net poley dlya avtora (`uploadedBy`/`userName`), laykov (`likes`), opisaniya (`description`). Komponent `SoulTile` otobrazhayet tolko izobrazheniye i metku "na moderatsii". Polzovatel ne vidit, kto avtor foto, skolko laykov, kogda dobavleno.
- **Kod:**
```typescript
// Foto-Dlya-Dushi.tsx:91-100
type SoulPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
  status: 'approved' | 'pending';
  local?: boolean;
  uploading?: boolean;
  progress?: number;
};  // <- NET author, likes, description
```
- **Ozhidaemoe povedeniye:** Pod foto dolzhny byt: imya avtora, data, kolichestvo laykov.
- **Fakticheskoye povedeniye:** Otobrazhayetsya tolko izobrazheniye.
- **Rekomendatsiya:** Dobavit polya v `SoulPhoto` i otobrazit ikh v `SoulTile`.

---

## BUG-4.8: TypeScript type mismatch: createdAt imeyet tip Date, no khranitsya kak number

- **Severity:** MEDIUM
- **Fayly:** `src/types/app.ts:285`, `src/firebase-config.ts:1335`
- **Problema:** V `CommunityPhoto` interface pole `createdAt` obyavleno kak `Date`, no v `photoAPI.addPhoto` ono sozdayotsya kak `Date.now()` (number). Eto mozhet privesti k oshibkam tipizatsii pri kompilyatsii i padeniyam, yesli kod ozhidayet methody Date (naprimer `.toISOString()`).
- **Kod:**
```typescript
// types/app.ts:285
createdAt: Date;  // <- tip Date

// firebase-config.ts:1335
createdAt: now,  // <- Date.now() vozvrashchayet number
```
- **Ozhidaemoe povedeniye:** Tipy dolzhny sootvetstvovat realno khranimym dannym.
- **Fakticheskoye povedeniye:** Tip `Date`, realno khranitsya `number` (timestamp).
- **Rekomendatsiya:** Pomenyat tip na `number` v `CommunityPhoto`.

---

## BUG-4.9: imageSafety.preflightImageSafety yavlyayetsya zaglushkoy

- **Severity:** MEDIUM
- **Fayl:** `src/utils/imageSafety.ts:8-9`
- **Funktsiya:** `preflightImageSafety()`
- **Problema:** Funktsiya preflightImageSafety nichego ne delayet — srazu vozvrashchayet `{ status: 'pending', reason: 'awaiting_moderator_safety_review' }`. Otsechka opasnykh faylov ne proiskhodit na etape zagruzki. Lyuboy fayl prokhodit bez proverki.
- **Kod:**
```typescript
// imageSafety.ts:8-9
export async function preflightImageSafety(_localUri: string): Promise<ImageSafetyResult> {
  return { status: 'pending', reason: 'awaiting_moderator_safety_review' };
  // <- NE proveryayet razmer, format, NE skaniruet soderzhimoye
}
```
- **Ozhidaemoe povedeniye:** Dolzhna byt khotya by minimalnaya proverka (razmer fayla, rasshireniye, magic bytes).
- **Fakticheskoye povedeniye:** Vsegda vozvrashchayet `pending`, proverka ne vypolnyayetsya.
- **Rekomendatsiya:** Realizovat minimalnuyu proverku (max file size, file extension whitelist, content-type validation).

---

## BUG-4.10: Otsutstvuyet rate limiting na zagruzki v korotkiy period

- **Severity:** MEDIUM
- **Fayl:** `src/utils/communityPhotoLimits.ts:4`
- **Problema:** Sushchestvuyet tolko mesyachnyy limit (5 foto), no net ogranicheniya na kolichestvo zagruzok v korotkiy period (naprimer, za 1 minutu). Polzovatel mozhet zagruzit 5 foto za 1 sekundu, chto mozhet privesti k nagruzke na server.
- **Kod:**
```typescript
// communityPhotoLimits.ts:4
export const COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT = 5;
```
- **Ozhidaemoe povedeniye:** Dobavit proverku na chastotu zagruzok (naprimer, ne bolee 1-2 foto v minutu).
- **Fakticheskoye povedeniye:** Tolko mesyachnyy limit bez kratkosrochnogo rate limitinga.
- **Rekomendatsiya:** Dobavit kratkosrochnyy rate limit (naprimer, cherez Firebase Rules ili storonnuyu logiku).

---

## BUG-4.11: Nepravilnyy endpoint dlya REST-zagruzki v Firebase Storage

- **Severity:** MEDIUM
- **Fayl:** `src/services/photoUploadService.ts:173`
- **Funktsiya:** `uploadViaFileSystem()`
- **Problema:** V kode ispolzuyetsya endpoint `firebasestorage.googleapis.com/v0/b/...`. V zadache 4.3 ukazano, chto pravilnyy endpoint — `firebasestorage.app`. Kho tya REST API cherez `googleapis.com` obychno rabotayet, v proyekte s bucketom `firebasestorage.app` eto mozhet privesti k problemam sovmestimosti.
- **Kod:**
```typescript
// photoUploadService.ts:173
const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodedPath}`;
// Dolzhno byt: `https://firebasestorage.app/v0/b/${bucket}/o?name=${encodedPath}`
```
- **Ozhidaemoe povedeniye:** Ispolzovat endpoint `firebasestorage.app`.
- **Fakticheskoye povedeniye:** Ispolzuyetsya `firebasestorage.googleapis.com`.
- **Rekomendatsiya:** Smenit endpoint na `firebasestorage.app`, soglasno trebovaniyu.

---

## PROVERENO, BAG NE OBNARUZHEN

### Task 4.1: Foto-Dlya-Dushi
- ✅ Galereya otkryvayetsya bez oshibok (yest error handling, loading state)
- ✅ Grid/masonry layout rabotayet (FlatList numColumns=3)
- ✅ Lazy loading cherez FlatList virtualizatsiyu + AppPhotoImage s keshirovaniyem
- ✅ Handle pustogo sostoyaniya (empty = net foto, loadError = oshibka seti)
- ✅ Rabotayet na Web (React Native + Expo)
- ✅ Kompressiya primenyayetsya pered zagruzkoy
- ✅ Progress bar zagruzki otobrazhayetsya i obnovlyayetsya
- ✅ Auth proverka pri dobavlenii foto (guestGuard)

### Task 4.2: Foto-Rayona
- ✅ Otkryvayetsya bez oshibok
- ✅ Zagruzhayutsya foto (analogichno Foto-Dlya-Dushi)
- ✅ Navigatsiya na ekran zagruzki rabotayet
- ✅ Raznitsa mezhdu Foto-Rayona i Foto-Dlya-Dushi: v Foto-Rayona ispolzuyetsya navigatsiya na otdelnyy ekran zagruzki, v Foto-Dlya-Dushi — vstroennyy PhotoUploadField.

### Task 4.3: PhotoUploadField
- ✅ Knopka "Vybrat foto" rabotayet
- ✅ Dialog vybora istochnika (kamera/galereya)
- ✅ Kompressiya primenyayetsya
- ✅ Progress bar zagruzki obnovlyayetsya
- ✅ Sostoyaniya oshibok obrabotany (error badge, Alert)
- ✅ Auth check pri piker (yesli net uid — pokazyvayet dialog vkhoda)

### Task 4.4: Metadata
- ✅ Polya sokhranyayutsya (title, description, uid, status, createdAt, likes)
- ✅ Put v RTDB: `/community_photos/{photoId}`
- ✅ Status po umolchaniyu `pending`
- ✅ UID avtora sokhranyayetsya
- ✅ Novyy foto ne sozdayotsya bez autentifikatsii (ensureFirebaseAuth)

### Task 4.5: MyApprovedPhotosScreen
- ✅ Filtratsiya po uid rabotayet
- ✅ Otobrazhayutsya vse statusy (pending, approved, rejected)
- ✅ Yest filtry po statusam
- ✅ Pustoye sostoyaniye obrabotano
- ✅ Polzovatel mozhet posmotret status svoikh foto
- ✅ Modal dobavleniya foto rabotayet

### Task 4.6: Moderaciya-Foto
- ✅ Ekran dlya admina s proverkoy roli `isModeratorUser()`
- ✅ Otobrazhayet foto, avtora, datu cherez `ModerationPhotoCard`
- ✅ Knopki "Odobrit" i "Otklonit" rabotayut
- ✅ Istoriya zayavok rabotayet

### Task 4.7: FeedLikeButton
- ✅ Knopka layka otobrazhayetsya
- ✅ Toggle layka rabotayet (postavit/snyat)
- ✅ Optimistic update (momentarnoye obnovleniye UI)
- ✅ Schyotchik laykov pravilnyy
- ✅ Bez autentifikatsii nelzya layknut

### Task 4.8: AppPhotoImage
- ✅ Keshirovaniye rabotayet (diskovyy kesh 50 MB, pamyat 30 min)
- ✅ Placeholder pri zagruzke (ActivityIndicator)
- ✅ Fallback pri oshibke (image-off icon, tekst)
- ✅ Raznyye razmery — pravilno masshtabiruyet (resizeMode)
- ✅ Web vs native — yedinyy komponent cherez React Native Image

### Task 4.9: Limity
- ✅ Mesyachnyy limit 5 foto (COMMUNITY_PHOTO_MONTHLY_REVIEW_LIMIT)
- ✅ Proverka formata fayla (rasshireniye, no NE magic bytes)
- ✅ Sanitizatsiya imeni fayla

### Task 4.10: Integratsiya
- ✅ UploadedPhotosGrid — pravilnyy layout s statusami
- ✅ PhotoPreviewField — korrektnyy preview
- ✅ Foto v zayavkakh, profile, mestakh zagruzhayutsya

---

## PRIORITET K ISPRAVLENIYU

1. **CRITICAL** — BUG-4.1: moderator role check v photoAPI.moderatePhoto
2. **HIGH** — BUG-4.2: kopirovaniye v community_photos_public
3. **HIGH** — BUG-4.3: Foto-Dlya-Dushi/Rayona chitayut iz community_photos
4. **HIGH** — BUG-4.4: MyApprovedPhotosScreen chitayet iz community_photos
5. **HIGH** — BUG-4.5: net preview photo po nazhatiyu
6. **HIGH** — BUG-4.6: neskolko konkuriruyushchikh servisov zagruzki
7. **MEDIUM** — BUG-4.7: net informatsii o foto v galereye
8. **MEDIUM** — BUG-4.8: createdAt type mismatch
9. **MEDIUM** — BUG-4.9: imageSafety zaglushka
10. **MEDIUM** — BUG-4.10: otsutstviye rate limitinga
11. **MEDIUM** — BUG-4.11: nepravilnyy endpoint storage
