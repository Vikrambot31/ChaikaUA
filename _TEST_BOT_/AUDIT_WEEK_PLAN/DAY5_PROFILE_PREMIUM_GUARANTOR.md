# DEN 5: PROFIL, NASTROYKI, PODPISKA, BONUSY, PORUCHITEL
## 10 zadach dlya AI-agenta

---

## KONTEKST DLYA AGENTA

Polzovatel AKTIVNO ispolzuet prilozhenie. Teper on hochet:
1. Upravliyat profilem (redaktirovat, smotret kak vidyat drugie)
2. Nastroit uvedomleniya
3. Posmotret bonusy i podpisku
4. Priglasit soseda (sistema poruchiteley)
5. Dobavit v izbrannoe

---

## ZADACHA 5.1: Profil polzovatelya (prosmotr)

**Fayly dlya proverki:**
- `src/screens/Profil-Polzovatelya.tsx`
- `src/screens/ViewUserProfileScreen.tsx`

**Chto proveryat:**
- [ ] Moy profil — vse polya vidny (imya, foto, dom, kvartira, professiya)
- [ ] Avatar — otobrazhaetsya li (svoj ili start-avatar)
- [ ] Telefon — maskiruetsya li (privatnost)
- [ ] Chuzhoy profil (ViewUserProfileScreen) — chto vidno?
- [ ] Proverka prav dostupa — kto mozhet videt moy profil?
- [ ] Chto budet esli profil ne zagruzilsya (net seti)
- [ ] Navigatsiya k "Redaktirovat profil"

**Imitatsiya polzovatelya:** Otkryl svoy profil. Vsyo na meste? Teper smotryu profil soseda.

---

## ZADACHA 5.2: Redaktirovanie profilya

**Fayly dlya proverki:**
- `src/screens/EditProfileScreen.tsx`
- `src/utils/validators.ts`

**Chto proveryat:**
- [ ] Vse polya redaktiruemy (imya, telefon, dom, professiya, bio)
- [ ] Tekushchie dannye predgapolneny
- [ ] Validatsiya pri sohranenii (te zhe pravila chto i pri registratsii)
- [ ] Sokhranenie v Firebase — rabotaet li
- [ ] Mozhno li menyat email?
- [ ] Mozhno li menyat foto profilya — zagruzka novogo
- [ ] Knopka "Sokhranit" — loading, uspekh, oshibka
- [ ] Chto budet esli dva ustroystva odnovremenno redaktiruyut

**Imitatsiya polzovatelya:** Hochu pomenyat telefon i foto. Redaktiruyu. Sohranyayu.

---

## ZADACHA 5.3: Proverka privatnosti profilya

**Fayly dlya proverki:**
- `src/services/profilePermissionService.ts`
- `src/components/ProfileViewRequestModal.tsx`
- `src/services/mediaAccess.ts`

**Chto proveryat:**
- [ ] Mozhno li zaprosit prosmotr chuzhogo profilya
- [ ] Otpravlyaetsya li zapros vladeltsu profilya
- [ ] Modal zapfosa — pravilno li otobrazhaetsya
- [ ] Chto vidit polzovatel DO odobreniya zaprosa
- [ ] Chto vidit polzovatel POSLE odobreniya
- [ ] mediaAccess — ogranichaet li dostup k foto profilya
- [ ] Net li sposobov oboyti zaprros na prosmotr

**Imitatsiya polzovatelya:** Hochu posmotret profil sosedki. Otpravlyayu zapros. Zhdu odobreniya.

---

## ZADACHA 5.4: Uvedomleniya i nastroyki

**Fayly dlya proverki:**
- `src/screens/Nalashtuvannya-Spovishchen.tsx`
- `src/redux/slices/notificationSlice.ts`
- `src/services/firebase-config.ts` (FCM)

**Chto proveryat:**
- [ ] Ekran nastroek otkryvaetsya
- [ ] Mozhno li vklyuchit/vyklyuchit push-uvedomleniya
- [ ] Sokhranuyutsya li nastroyki
- [ ] FCM token — registriruetsya li pri logine
- [ ] Chto budet esli polzovatel zapretil push v OS
- [ ] notificationSlice — pravilno li obnovlyaetsya
- [ ] Typy uvedomleniy — novaya zayavka, otvet na moyu, moderatsiya

**Imitatsiya polzovatelya:** Hochu otklyuchit uvedomleniya o novostyakh. Idu v nastroyki.

---

## ZADACHA 5.5: Premium podpiska

**Fayly dlya proverki:**
- `src/screens/Podpiska-Premium.tsx`
- `src/components/PremiumGate.tsx`
- `src/components/PremiumPromoNotice.tsx`
- `src/components/PremiumActivatedModal.tsx`
- `src/redux/slices/subscriptionSlice.ts`

**Chto proveryat:**
- [ ] Ekran podpiski — otobrazhauyutsya li plany (free, premium, premium_plus, business_plus)
- [ ] Tseny — pravilnye li
- [ ] Knopka "Podpisatsya" — chto proiskhodit (payment flow?)
- [ ] PremiumGate — blokiruet li premium-funktsii dlya free polzovateley
- [ ] Soobshchenie o blokirovke — ponnyatnoe li
- [ ] PremiumActivatedModal — pokazyvaetsya li posle aktivatsii
- [ ] subscriptionSlice — pravilno li sohranyaet plan/status
- [ ] Chto budet kogda podpiska istechet
- [ ] Trial 7 dney — rabotaet li

**Imitatsiya polzovatelya:** Vizhu "Premium". Chto tam? Skol'ko stoit? Kak kupit?

---

## ZADACHA 5.6: Bonusy i koshelyok

**Fayly dlya proverki:**
- `src/screens/BonusWalletScreen.tsx`
- `src/screens/PromoCreditsTopupScreen.tsx`
- `src/screens/BonusPromotionPurchaseScreen.tsx`
- `src/services/bonusService.ts`

**Chto proveryat:**
- [ ] Koshelyok — otobrazhaetsya li balans
- [ ] Istochniki bonusov — otkuda oni beruyutsya
- [ ] Popholen — rabotaet li PromoCreditsTopupScreen
- [ ] Pokupka za bonusy — rabotaet li BonusPromotionPurchaseScreen
- [ ] bonusService — pravilno li nachislyayeet/spisyvayet
- [ ] Istoriya tranzaktsiy — est li
- [ ] Chto budet esli bonusov ne hvatayet na pokupku
- [ ] Mozhno li poluchit otritsatelnyy balans (BUG!)

**Imitatsiya polzovatelya:** Smotryu svoi bonusy. Skol'ko u menya? Za chto poluchil?

---

## ZADACHA 5.7: Sistema poruchiteley

**Fayly dlya proverki:**
- `src/screens/Poruchitel.tsx`
- `src/services/sponsorService.ts`

**Chto proveryat:**
- [ ] Ekran poruchitelya otkryvaetsya
- [ ] Spisok moikh priglashennykh — vidno li
- [ ] Mozhno li priglasit novogo soseda
- [ ] Kak proishodit priglashenie — po telefonu? Po ssylke?
- [ ] sponsorService — chto pishet v Firebase:
  - `referrals` (staraya sistema)?
  - `trust_tree` (novaya sistema)?
  - OBE? (izvestnyy bug — dve ne-sinhronizirovannye sistemy!)
- [ ] Glubina v dereve doveriya (depthToRoot) — pravilno li schitaetsya
- [ ] Bonus za priglashenie — nachislyaetsya li
- [ ] Chto budet esli priglashyonnyy uzhe zaregistrirovan

**Imitatsiya polzovatelya:** Hochu priglasit soseda. Kak eto sdelat? Gde moy bonus?

---

## ZADACHA 5.8: Izbrannoe

**Fayly dlya proverki:**
- `src/screens/FavoritesScreen.tsx`

**Chto proveryat:**
- [ ] Ekran izbrannogo otkryvaetsya
- [ ] Mozhno li dobavit mesto/zayavku v izbrannoe
- [ ] Mozhno li udalit iz izbrannogo
- [ ] Sokhranuyutsya li favorty posle perezapuska
- [ ] Gde khranytsia (AsyncStorage? Firebase?)
- [ ] Chto budet esli izbrannoe pusto
- [ ] Klikabelny li elementy v izbrannoe (perekhod k detalyam)

**Imitatsiya polzovatelya:** Nashol klassnoye kafe. Dobavlyayu v izbrannoe. Nakhozhu potom?

---

## ZADACHA 5.9: O prilozhenii i podderzhka

**Fayly dlya proverki:**
- `src/screens/Pro-Prilozhenie.tsx`
- `src/screens/SupportScreen.tsx`
- `src/screens/AppVersionInfoScreen.tsx`
- `src/screens/Kontakt-XXX.tsx`
- `src/services/supportService.ts`

**Chto proveryat:**
- [ ] "O prilozhenii" — versiya pravilnaya (1.1.419)
- [ ] Support — mozhno li otpravit soobshchenie
- [ ] supportService — kuda pishet (Firebase? Email?)
- [ ] Kontakt-XXX — VNIMANIE: izvestnyy bug — otsutstvie proverki avtorizatsii!
  - Pozvoliyaet li anonimnym polzovatelyam zvonit cherez Viber?
  - handleViber() — est li proverka user?.id?
- [ ] Forma obratnoy svyazi — validatsiya, otpravka
- [ ] AppVersionInfoScreen — pravilnaya li informatsiya

**Imitatsiya polzovatelya:** Nashol bag. Hochu napisat v podderzhku. Kak? Gde?

---

## ZADACHA 5.10: Reyting domov i stroy

**Fayly dlya proverki:**
- `src/screens/Reyting-Domov.tsx`
- `src/screens/BuildingRatingDetailScreen.tsx`
- `src/services/buildingRatingService.ts`

**Chto proveryat:**
- [ ] Reyting domov — spisok zagruzhaetsya
- [ ] Sortirovka — po reytingu?
- [ ] Detali reytinga — iz chego skladyvaetsya
- [ ] buildingRatingService — otkuda beruyutsya dannye
- [ ] Mozhno li golosovat za svoy dom
- [ ] Navigatsiya mezhdu spiskom i detalyami
- [ ] Chto budet esli net dannyh o reytinge

**Imitatsiya polzovatelya:** Hochu posmotret reyting moego doma. Gde eto?

---

## FORMAT OTCHETA ZA DEN 5

Sozdai fayl `DAY5_REPORT.md` po formatu iz `00_MASTER_PLAN.md`
