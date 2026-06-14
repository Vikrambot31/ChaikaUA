# DEN 3: MESTA, KARTA, SPRAVOCHNIK, KATALOGI
## 10 zadach dlya AI-agenta

---

## KONTEKST DLYA AGENTA

Polzovatel hochet nayti MESTO — kafe, magazin, salon, shkolu, detskiy sad.
Eto vtoroy po vazhnosti stsenariy prilozhcheniya — spravochnik Chayki.
Polzovatel mozhet iskat na karte ili v spiske. Mozhet posmotret detali, otzyvy, otsemki.

---

## ZADACHA 3.1: Karta Chayki (glavnaya karta)

**Fayly dlya proverki:**
- `src/screens/Karta-Chayki.tsx`
- `src/screens/Karta-Chayki.native.tsx`
- `src/screens/Karta-Chayki.web.tsx`
- `src/components/PlaceMarker.tsx`
- `src/utils/mapFocusParams.ts`

**Chto proveryat:**
- [ ] Otkryvaetsya li karta bez oshibok (Google Maps API key?)
- [ ] Otobrazhauyutsya li markery na karte
- [ ] Markery klikabelny — otkryvaetsya li info
- [ ] Razlichiya mezhdu native i web versiyami
- [ ] Pravilnye li koordinaty (Chayka, Kiyevskaya oblast)
- [ ] Rabotaet li zoom, sdvig
- [ ] Chto budet esli geolokatsiya otklyuchena
- [ ] Zagruzka markerov — est li loading

**Imitatsiya polzovatelya:** Otkryl kartu. Vizhu markery? Nazhal na marker — chto vizhu?

---

## ZADACHA 3.2: Spisok mest

**Fayly dlya proverki:**
- `src/screens/Spisok-Mest.tsx`
- `src/screens/Mesta-Chayki.tsx`
- `src/components/PlaceCard.tsx`
- `src/redux/slices/placesSlice.ts`

**Chto proveryat:**
- [ ] Zagruzhaetsya li spisok mest
- [ ] Kazhdoe mesto otobrazhaetsya s nazvaniem, adresom, otsenkoy
- [ ] Est li ikonki/kategorii
- [ ] Rabotaet li filtratsiya po kategoriyam
- [ ] Rabotaet li poisk po nazvaniyu
- [ ] Chto budet esli mest net v baze — pustoy ekran?
- [ ] Klikabelna li kartochka mesta — perekhod k detalyam
- [ ] PlaceCard — pravilno li otobrazhaet rating (1-5 zvyozd)

**Imitatsiya polzovatelya:** Ishchu kafe. Smotru spisok. Filtruyuu. Nashol? Nazhal.

---

## ZADACHA 3.3: Detali mesta

**Fayly dlya proverki:**
- `src/screens/Panel-Detaley-Mesta.tsx`
- `src/services/placesService.ts`
- `src/utils/googleMapsLink.ts`

**Chto proveryat:**
- [ ] Polnaya informatsiya o meste (nazvanie, adres, telefon, rezhim raboty)
- [ ] Foto mesta — zagruzhayutsya li
- [ ] Otsenka/reyting — pravilno li otobrazhaetsya
- [ ] Knopka "Pozvonit" — otkryvaet dialer
- [ ] Knopka "Marshrut" — otkryvaet Google Maps
- [ ] Knopka "Podelit'sya" — rabotaet li
- [ ] Chto budet esli mesto ne naydeno (nevernyy ID v params)
- [ ] Otzyvy — otobrazhauyutsya li
- [ ] Mozhno li ostavit otzyv

**Imitatsiya polzovatelya:** Nashol kafe. Smotryu detali. Hochu pozhat dostavat — zhmu "Pozvonit".

---

## ZADACHA 3.4: Luchshie mesta i interesnye mesta

**Fayly dlya proverki:**
- `src/screens/Luchshiye-Mesta.tsx`
- `src/screens/Interesnye-Mesta.tsx`
- `src/screens/Mistsa-i-Lyudi-Hub.tsx`

**Chto proveryat:**
- [ ] Ekrany otkryvayutsya bez oshibok
- [ ] Dannye zagruzhayutsya (ne pustye ekrany)
- [ ] Sortirovka — po reytingu / populyarnosti
- [ ] Klikabelnost kartochek — perekhod k detalyam
- [ ] Hub ekran — vse ssylki rabotayut
- [ ] Chto vidit polzovatel esli mest malo (< 5)?

**Imitatsiya polzovatelya:** Hochu nayti luchshee kafe. Idu v "Luchshiye mesta".

---

## ZADACHA 3.5: Eda na Chayke

**Fayly dlya proverki:**
- `src/screens/Eda-Na-Chayke.tsx`
- `src/screens/Top-Kafe.tsx`
- `src/screens/Top-Magaziny.tsx`
- `src/services/foodTopService.ts`
- `src/services/foodSeed.ts`

**Chto proveryat:**
- [ ] Ekran "Eda na Chayke" — vse sektsii vidny
- [ ] Top kafe — spisok zagruzhaetsya, kartochki klikabelny
- [ ] Top magaziny — spisok zagruzhaetsya
- [ ] foodSeed — eto staticheskiye dannye ili iz Firebase?
- [ ] Pravilnyye li nazvaniya, adresa, telefony
- [ ] Foto zagruzhauyutsya
- [ ] Navigatsiya mezhdu ekranami rabotaet

**Imitatsiya polzovatelya:** Golodnyy. Ishchu gde poyest. Idu v "Eda na Chayke".

---

## ZADACHA 3.6: Salony krasoty

**Fayly dlya proverki:**
- `src/screens/Salony-Krasoty.tsx`
- `src/screens/Detal-Salona.tsx`
- `src/screens/Detal-Predlozheniya-Salona.tsx`
- `src/services/beautySeed.ts`

**Chto proveryat:**
- [ ] Spisok salonov zagruzhaetsya
- [ ] Detali salona polnye (uslugi, tseny, kontakty)
- [ ] Spetspredlozheniya — otobrazhauyutsya li
- [ ] Detali predlozheniya — pravilno li otkryvayutsya
- [ ] beautySeed — aktualnye li dannye
- [ ] Navigatsiya rabotaet (spisok → detal → predlozhenie)

**Imitatsiya polzovatelya:** Ishchu parikmaherskuyu. Nashla salon. Smotryu uslugi i tseny.

---

## ZADACHA 3.7: Vsyo dlya detey

**Fayly dlya proverki:**
- `src/screens/Vse-Dlya-Detey.tsx`
- `src/screens/Detal-Detskogo-Mesta.tsx`
- `src/screens/Detal-Detskogo-Predlozheniya.tsx`
- `src/services/childrenSeed.ts`

**Chto proveryat:**
- [ ] Razdel "Vsyo dlya detey" otkryvaetsya
- [ ] Spisok detskikh mest/kruzhkov zagruzhaetsya
- [ ] Detali mesta — polnaya informatsiya
- [ ] Predlozheniya — otobrazhauyutsya
- [ ] childrenSeed — danyye aktualnye
- [ ] Navigatsiya rabotaet

**Imitatsiya polzovatelya:** Ishchu kruzhok dlya rebyonka. Smotru razdel "Vsyo dlya detey".

---

## ZADACHA 3.8: Sport na Chayke

**Fayly dlya proverki:**
- `src/screens/Sport-Na-Chayke.tsx`
- `src/screens/Sport-Detal.tsx`
- `src/services/sportsService.ts`

**Chto proveryat:**
- [ ] Razdel sporta otkryvaetsya
- [ ] Spisok sportivnyh mest/sektsiy zagruzhaetsya
- [ ] Detali — polnaya informatsiya
- [ ] Navigatsiya rabotaet
- [ ] Chto budet esli dannyh net

**Imitatsiya polzovatelya:** Ishchu sportploshchadku. Idu v "Sport na Chayke".

---

## ZADACHA 3.9: Marketplace (Kuplu-Prodam) i rabota

**Fayly dlya proverki:**
- `src/screens/Kuplu-Prodam.tsx`
- `src/screens/CreateBuySellScreen.tsx`
- `src/screens/Poisk-Raboty.tsx`
- `src/screens/Kto-Poteryal.tsx`
- `src/services/buySellService.ts`
- `src/services/jobService.ts`
- `src/services/lostFoundService.ts`

**Chto proveryat:**
- [ ] Kuplu-Prodam — spisok obyavleniy zagruzhaetsya
- [ ] Mozhno li sozdat obyavlenie (CreateBuySellScreen)
- [ ] Validatsiya formy obyavleniya (tsena, opisanie, foto)
- [ ] Poisk raboty — spisok vakansiy
- [ ] Kto-Poteryal — spisok naydennogo/poterennogo
- [ ] Servisy — pravilno li sohranyuyut/zagruzhayut dannye
- [ ] Navigatsiya vnutri kazhdogo razdela

**Imitatsiya polzovatelya:** Hochu prodat staryy divan. Idu v "Kuplu-Prodam". Sozdayu obyavlenie.

---

## ZADACHA 3.10: Obshchie problemy spravochnika

**Fayly dlya proverki:**
- `src/screens/Razdel.tsx`
- `src/screens/Spravka.tsx`
- `src/screens/servicesHub.tsx`
- `src/services/chaykaPlacesData.ts`
- `src/services/chaykaBuildingPlaces.ts`
- `src/services/contactsService.ts`

**Chto proveryat:**
- [ ] Razdel.tsx — pravilno li otobrazhaet kategorii
- [ ] servicesHub — vse ssylki rabotayut
- [ ] chaykaPlacesData — pravilnye li koordinaty, nazvaniya
- [ ] chaykaBuildingPlaces — sovpadaet li s realnymy domami
- [ ] contactsService — est li vse neobhodimye kontakty
- [ ] Spravka — otkryvaetsya li, est li poleznaya informatsiya
- [ ] Net li "mertvyh" ssylok v navigatsii

**Imitatsiya polzovatelya:** Ishchu kontakty upravljayushchey kompanii. Idu v "Spravochnik".

---

## FORMAT OTCHETA ZA DEN 3

Sozdai fayl `DAY3_REPORT.md` po formatu iz `00_MASTER_PLAN.md`
