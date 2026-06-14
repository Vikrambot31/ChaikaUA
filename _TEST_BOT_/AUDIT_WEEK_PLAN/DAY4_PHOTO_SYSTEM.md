# DEN 4: FOTO-SISTEMA, ZAGRUZKA, MODERATSIYA, GALEREYA
## 10 zadach dlya AI-agenta

---

## KONTEKST DLYA AGENTA

Polzovatel hochet podelitsya foto svoego rayona — krasivyy zakat, tsvetushchiy park, novyy mural.
Eto sotsialnyy element prilozhcheniya. Polzovatel zagruzhaet foto, admin moderiryet, odobrennye foto
vidat vsem v galereye. Eto mozhno sravnit s Instagram dlya Chayki.

VAZHNO: Eta sistema uzhe imela bagi (sm. rannie audity) — proverya OSOBENNO VNIMATELNO.

---

## ZADACHA 4.1: Foto dlya Dushi (osnovnaya galereya)

**Fayly dlya proverki:**
- `src/screens/Foto-Dlya-Dushi.tsx`
- `src/services/photoService.ts`

**Chto proveryat:**
- [ ] Galereya otkryvaetsya bez oshibok
- [ ] Foto zagruzhayutsya i otobrazhauyutsya
- [ ] Pravilnyy li istochnik — `/community_photos_public` (a ne `/community_photos`)
- [ ] Grid/masonry layout rabotaet
- [ ] Mozhno li nazhat na foto dlya uvelichennogo prosmotra
- [ ] Informatsiya o foto (avtor, data, laiki) — vidna li
- [ ] Lazy loading foto — est li, chtoby ne zagruzhat vse srazu
- [ ] Chto budet esli foto net v baze
- [ ] Rabotaet li na Web

**Imitatsiya polzovatelya:** Otkryl galereyu. Smotru foto sosedey. Krasivo? Bystro zagruzhaetsya?

---

## ZADACHA 4.2: Foto Rayona

**Fayly dlya proverki:**
- `src/screens/Foto-Rayona.tsx`

**Chto proveryat:**
- [ ] V chyom raznitsa mezhdu Foto-Rayona i Foto-Dlya-Dushi?
- [ ] Otkryvaetsya li bez oshibok
- [ ] Zagruzhuyutsya li foto
- [ ] Navigatsiya — otkuda syuda mozhno popast
- [ ] Dublirovanie — te zhe foto ili druguie?

**Imitatsiya polzovatelya:** Nazhal "Foto rayona". Eto drugoy razdel? Ili to zhe samoe?

---

## ZADACHA 4.3: Zagruzka foto

**Fayly dlya proverki:**
- `src/screens/Zagruzka-Foto.tsx`
- `src/components/PhotoUploadField.tsx`
- `src/services/photoUploadService.ts`
- `src/services/unifiedPhotoUpload.ts`
- `src/utils/imageCompressor.ts`
- `src/utils/imageSafety.ts`
- `src/utils/photoPicker.ts`

**Chto proveryat:**
- [ ] Knopka "Zagruzit foto" — otkryvaetsya galereya ili kamera
- [ ] Vybor istochnika (kamera vs galereya) — est li dialog
- [ ] Kompressiya: primenyaetsya li (razmer, kachestvo)
- [ ] Zagruzka v Firebase Storage:
  - Pravilnyy endpoint: `firebasestorage.app` (NE `googleapis.com`)
  - Auth header (Firebase token scheme)
  - Pravilnyy put: `community_photos/{uid}/{id}.jpg`
- [ ] Progress bar zagruzki — est li, obnovlyaetsya li
- [ ] Mozhno li otmenitit zagruzku
- [ ] Chto budet esli zagruzka prervana (poterya seti)
- [ ] Limit zagruzok v mesyats (assertCommunityPhotoMonthlyLimit) — rabotaet li
- [ ] imageSafety — proveryaet li razmer/format faylov
- [ ] Dva servisa zagruzki (photoUploadService vs unifiedPhotoUpload) — net li konflikta

**Imitatsiya polzovatelya:** Hochu zagruzit foto zakata. Vyberayu iz galerei. Zhdu zagruzku...

---

## ZADACHA 4.4: Metadata foto i sokhranenie

**Fayly dlya proverki:**
- `src/services/photoService.ts`
- `src/types/app.ts` (CommunityPhoto tip)

**Chto proveryat:**
- [ ] Kakiye polya sokhranuyutsya (title, description, uid, status, createdAt, likes)
- [ ] Pravilnyy li put v RTDB: `/community_photos/{photoId}`
- [ ] Status po umolchaniyu — `pending` (ne `approved`!)
- [ ] UID avtora sokhranayetsya pravilno
- [ ] createdAt — v kakom formate (timestamp vs ISO string)
- [ ] Net li vozmozhnosti sokhranit foto BEZ autentifikatsii

**Imitatsiya polzovatelya:** Zagruzil foto. Gde ono teper? Vizhu li ya yego v svoikh foto?

---

## ZADACHA 4.5: Moi odobrennye foto

**Fayly dlya proverki:**
- `src/screens/MyApprovedPhotosScreen.tsx`

**Chto proveryat:**
- [ ] Otobrazhauyutsya TOLKO moi foto (filter po uid)
- [ ] Istochnik — `community_photos_public` (NE `community_photos`!)
- [ ] Status foto — tolko approved ili vse?
- [ ] Chto budet esli u menya net odorennykh foto
- [ ] Mozhno li udalit svoyo foto
- [ ] Mozhno li posmotret status neodorennykh foto

**Imitatsiya polzovatelya:** Hochu uvidet svoi odobrennye foto. Gde oni? Pochemu ne vizhu?

---

## ZADACHA 4.6: Moderatsiya foto (polzovatelskaya storona)

**Fayly dlya proverki:**
- `src/screens/Moderaciya-Foto.tsx`
- `src/components/ModerationPhotoCard.tsx`

**Chto proveryat:**
- [ ] Eto ekran dlya ADMINA ili dlya POLZOVATELYA?
- [ ] Esli dlya admina — est li proverka roli (isAdmin/isModerator)
- [ ] Kartochka moderatsii — otobrazhaet foto, avtora, datu
- [ ] Knopki "Odobrit" i "Otklonit" — rabotayut li
- [ ] Obnovlyaetsya li status foto v RTDB posle deystviya
- [ ] Foto perekhodit v `/community_photos_public` posle odobreniya
- [ ] Chto budet esli obychnyy polzovatel poprobyet otkryt etot ekran

**Imitatsiya polzovatelya (admin):** Vizhu novye foto na moderatsii. Odobryayu. Otklonyayu. Vsyo rabotaet?

---

## ZADACHA 4.7: Layki i vzaimodeystvie s foto

**Fayly dlya proverki:**
- `src/components/FeedLikeButton.tsx`
- `src/services/photoService.ts` (funktsii laykov)

**Chto proveryat:**
- [ ] Knopka layka — otobrazhaetsya li
- [ ] Nazhal layk — schyotchik uvelchaetsya
- [ ] Nazhal eshche raz — layk snyaetsya (toggle)
- [ ] Sohranyaetsya li layk v Firebase
- [ ] Mozhno li laykat bez autentifikatsii (NE DOLZHNO!)
- [ ] Optimistic update — layk vidno srazu ili posle zagruzki
- [ ] Schyotchik laykov — pravilnyy li

**Imitatsiya polzovatelya:** Ponravilas foto. Stavlu layk. Schyotchik +1?

---

## ZADACHA 4.8: AppPhotoImage komponent

**Fayly dlya proverki:**
- `src/components/AppPhotoImage.tsx`

**Chto proveryat:**
- [ ] Keshirovanie foto — rabotaet li
- [ ] Placeholder pri zagruzke — est li
- [ ] Obrabotka oshibki (broken image) — fallback
- [ ] Raznyye razmery foto — pravilno li masshtabiruyet
- [ ] Web vs native — est li raznitsa v povedenii

**Imitatsiya polzovatelya:** Smotru foto v galereye. Vse foto zagruzhenyy? Net li "broken images"?

---

## ZADACHA 4.9: Limity i bezopasnost foto-sistemy

**Fayly dlya proverki:**
- `src/utils/communityPhotoLimits.ts`
- `src/utils/imageSafety.ts`
- `src/services/photoUploadService.ts` (proverki bezopasnosti)

**Chto proveryat:**
- [ ] Mesyachnyy limit zagruzok — kakoy? Rabotaet li?
- [ ] Proverka tipa faylov — tolko jpg/png?
- [ ] Proverka razmera — max razmer?
- [ ] Mozhno li zagruzit ne-foto (pdf, exe) — dolzhno blokirovatsya
- [ ] Sanitizatsiya imeni faylov
- [ ] Chto budet esli polzovatel poprobyet zagruzit 100 foto podryad

**Imitatsiya polzovatelya:** Popyatalsya zagruzit PDF vmesto foto. Chto budet?

---

## ZADACHA 4.10: Integrastiya foto so vsem prilozheniem

**Fayly dlya proverki:**
- Vse ekrany gde otobrazhauyutsya foto (profil, zayavki, mesta)
- `src/components/UploadedPhotosGrid.tsx`
- `src/components/PhotoPreviewField.tsx`

**Chto proveryat:**
- [ ] Foto v profileh polzovateley — zagruzhayutsya li
- [ ] Foto v zayavkakh — otobrazhauyutsya li
- [ ] Foto v mestakh — zagruzhayutsya li
- [ ] UploadedPhotosGrid — pravilnyy layout
- [ ] PhotoPreviewField — pravilnyy preview
- [ ] Consistentnost — odinakovo li foto otobrazhaetsya vo vsekh mestakh
- [ ] Net li "bityh" URL foto (staroe hranilishche vs novoe)

**Imitatsiya polzovatelya:** Vizhu foto v raznykh mestakh prilozhcheniya. Vse li zagruzilis?

---

## FORMAT OTCHETA ZA DEN 4

Sozdai fayl `DAY4_REPORT.md` po formatu iz `00_MASTER_PLAN.md`
