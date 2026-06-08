# DEN 2: GLAVNYY EKRAN, LENTA ZAYAVOK, SOZDANIE ZAYAVOK
## 10 zadach dlya AI-agenta

---

## KONTEKST DLYA AGENTA

Polzovatel UZHE zaregistrirovalsya i voshyol v prilozhenie. On vidit glavnyy ekran.
Ego osnovnoy stsenariy:
1. Smotret lentu zayavok (pomosh ot sosedey)
2. Sozdat svoyu zayavku (poprosit o pomoshi)
3. Otvetit na chuzhuu zayavku
4. Posmotret svoi zayavki

Eto KLYUCHEVAYA funktsionalnost — imenno radi etogo lyudi ispolzuyut prilozhenie.

---

## ZADACHA 2.1: Glavnyy ekran (Home)

**Fayly dlya proverki:**
- `src/screens/Glavny-Ekran.tsx`
- `src/components/BottomNavigation.tsx`

**Chto proveryat:**
- [ ] Otkryvaetsya li ekran bez oshibok
- [ ] Otobrazhauyutsya li vse sekcii (lenta, novosti, aktivnost)
- [ ] Rabotayut li vse knopki na ekrane
- [ ] Pravilno li rabotaet BottomNavigation (pereklyuchenie tabov)
- [ ] Est li pull-to-refresh (obnovlenie sverhku vniz)
- [ ] Chto budet esli net dannyh — pokazyvaetsya li placeholder
- [ ] Loading indikator pri zagruzke dannyh
- [ ] Chto vidit NOVYY polzovatel vs STARYY polzovatel
- [ ] Rabotaet li na Web platforme

**Imitatsiya polzovatelya:** Otkryl prilozhenie. Vizhu glavnyy ekran. Chto tut est? Vsyo ponyatno?

---

## ZADACHA 2.2: Lenta zayavok (spisok)

**Fayly dlya proverki:**
- `src/screens/Spisok-Zayavok.tsx`
- `src/components/RequestItem.tsx`
- `src/redux/slices/requestsSlice.ts`

**Chto proveryat:**
- [ ] Zagruzhaetsya li spisok zayavok iz Firebase
- [ ] Pravilno li otobrazhaetsya kazhdaya zayavka (avtor, kategoriya, tekst, data)
- [ ] Rabotaet li skrolling (FlatList/ScrollView performance)
- [ ] Est li filter po kategoriyam
- [ ] Chto budet esli zayavok net — pustoy ekran ili soobshchenie?
- [ ] Obnovlyaetsya li lenta v realnom vremeni (realtime listener)
- [ ] Pravilno li formatiruetsya data/vremya zayavki
- [ ] Otobrazhaetsya li avatar avtora
- [ ] Telefonnyy nomer — maskiruetsya li (privatnost)
- [ ] Pagination — zagruzhaetsya li bolshe pri skrolle

**Imitatsiya polzovatelya:** Listau lentu zayavok. Vizhu zayavki sosedey. Vsyo chitaemo? Data pravilna?

---

## ZADACHA 2.3: Detali zayavki

**Fayly dlya proverki:**
- `src/screens/Detal-Zayavki.tsx`
- `src/utils/communicationActions.ts`

**Chto proveryat:**
- [ ] Otkryvaetsya li detal zayavki po navezhaniyu
- [ ] Vse li polya vidny (opisanie, kategoriya, data, avtor, foto)
- [ ] Rabotaet li knopka "Pozvonit" (otkrytie dialer)
- [ ] Rabotaet li knopka "Napisat" (sms/chat)
- [ ] Chto budet esli zayavka udalena (a polzovatel perekhel po ssylke)
- [ ] Pravilno li obrabatyvayutsya parametry navigatsii
- [ ] Knopka "Nazad" — rabotaet li
- [ ] Prikreplennye foto — otobrazhauyutsya li

**Imitatsiya polzovatelya:** Nazhal na zayavku. Vizhu detali. Hochu pomoch — zhmu "Pozvonit".

---

## ZADACHA 2.4: Vybor kategorii zayavki

**Fayly dlya proverki:**
- `src/screens/Vibor-Temy-Zayavki.tsx`
- `src/utils/constants.ts` (kategorii)
- `src/types/app.ts` (tipy kategoriy)

**Chto proveryat:**
- [ ] Vse kategorii otobrazhauyutsya (medical, electricity, repair, help_neighbors, etc.)
- [ ] Ikonki kategoriy zagruzhayutsya
- [ ] Tekst kategoriy na pravilnom yazyke (ne na angliyskom!)
- [ ] Nazhal na kategoriyu — perekhod k forme
- [ ] Net li "mertvyh" kategoriy (knopka est, no nikuda ne vedyot)
- [ ] Poryadok kategoriy logichnyy dlya polzovatelya
- [ ] Mozhno li vernutsya nazad

**Imitatsiya polzovatelya:** Hochu sozdat zayavku. Vyberayu temu. Vse temy ponyatny?

---

## ZADACHA 2.5: Forma sozdaniya zayavki

**Fayly dlya proverki:**
- `src/screens/Forma-Zayavki.tsx`
- `src/utils/submissionRequirements.ts`
- `src/utils/requestFormLimitGuard.ts`
- `src/utils/contentLanguageGuard.ts`
- `src/services/censor.ts`

**Chto proveryat:**
- [ ] Vse polya formy otobrazhauyutsya (opisanie, foto, audio)
- [ ] Validatsiya opisaniya (max 280 simvolov, schyotchik simvolov)
- [ ] Proverka yazyka — sovpadaet li s vybrannym yazykom
- [ ] Tsenzor — filtraitsiya neprilichnogo kontenta
- [ ] Dnevnoy limit (30 zayavok/den) — rabotaet li proverka
- [ ] Limit po kategorii (5 help_neighbors/den) — rabotaet li
- [ ] Sanitizatsiya HTML/spetssimvolov
- [ ] Knopka "Otpravit" — aktivna tolko kogda forma validna
- [ ] Loading pri otpravke
- [ ] Uspeshnaya otpravka — soobshchenie + redirect
- [ ] Oshibka pri otpravke — soobshchenie + mozhno li povtorit

**Imitatsiya polzovatelya:** Zapolnyayu formu. Pishu opisanie. Prilagayu foto. Zhmu "Otpravit".

---

## ZADACHA 2.6: Zagruzka foto v zayavku

**Fayly dlya proverki:**
- `src/components/RequestPhotoUploadField.tsx`
- `src/components/PhotoUploadField.tsx`
- `src/services/photoUploadService.ts`
- `src/utils/imageSafety.ts`
- `src/utils/imageCompressor.ts`

**Chto proveryat:**
- [ ] Knopka "Dobavit foto" — otkryvaetsya li galereya/kamera
- [ ] Rabotaet li kompressiya foto
- [ ] Rabotaet li zagruzka v Firebase Storage
- [ ] Est li progress bar zagruzki
- [ ] Chto budet esli foto slishkom bolshoe
- [ ] Chto budet esli otmenitit zagruzku
- [ ] Rabotaet li na WEB (bez natinnogo dostupa k kamere)
- [ ] Pravilnyy li endpoint zagruzki (proverka `firebasestorage.app` vs `firebasestorage.googleapis.com`)
- [ ] Auth header prisutstvuet pri zagruzke
- [ ] Preview foto pered otpravkoy

**Imitatsiya polzovatelya:** Prilagayu foto k zayavke. Vizhu preview? Progress bar? Oshibka?

---

## ZADACHA 2.7: Golosovoe soobshchenie v zayavke

**Fayly dlya proverki:**
- `src/components/VoiceRecorder.tsx`
- `src/services/photoUploadService.ts` (ili otdelnyy audio service)
- `src/types/app.ts` (AudioAttachment)

**Chto proveryat:**
- [ ] Knopka zapisi — aktiviruetsya li mikrofon
- [ ] Razreshenie na mikrofon — zaprashovaetsya li
- [ ] Limit zapisi — max 5MB
- [ ] Indikator zapisi (vremya, animatsiya)
- [ ] Mozhno li proelushat pered otpravkoy
- [ ] Mozhno li udalit zapis i perepisat
- [ ] Zagruzka v Firebase Storage — rabotaet li
- [ ] Chto budet esli polzovatel ne dal razreshenie na mikrofon
- [ ] Rabotaet li na Web platforme

**Imitatsiya polzovatelya:** Hochu zapisat golosovoe. Nazhal knopku. Zapisivayu. Slushayu. Otpravlyayu.

---

## ZADACHA 2.8: Moi zayavki

**Fayly dlya proverki:**
- `src/screens/Moi-Zayavki.tsx`
- `src/screens/ProfileRequestsScreen.tsx`
- `src/screens/Istoriya-Zaprosov.tsx`

**Chto proveryat:**
- [ ] Otobrazhauyutsya li VSE moi zayavki (pending + approved + rejected)
- [ ] Kazhdaya zayavka pokazyvaet status (na moderatsii, odobrena, otklonena)
- [ ] Mozhno li udalit svoyu zayavku
- [ ] Mozhno li redaktirovat svoyu zayavku
- [ ] Pravilnyy li poryadok (novye sverkhu)
- [ ] Chto budet esli zayavok net — soobshchenie ili pustota?
- [ ] Svyaz mezhdu Moi-Zayavki i ProfileRequestsScreen (dubliruyut li?)
- [ ] Istoriya-Zaprosov — eto to zhe samoe ili drugoe?

**Imitatsiya polzovatelya:** Hochu posmotret svoi zayavki. Gde? V profile? V otdelnom razdele?

---

## ZADACHA 2.9: Pomoch sosedyam

**Fayly dlya proverki:**
- `src/screens/Pomoch-Sosedyam.tsx`
- `src/redux/slices/helpRequestsSlice.ts`
- `src/screens/Zapros-Pomoshi.tsx`

**Chto proveryat:**
- [ ] Otkryvaetsya li razdel "Pomoch sosedyam"
- [ ] Otobrazhauyutsya li zayavki ot sosedey
- [ ] Filtratsiya — tolko kategoriya help_neighbors ili vse?
- [ ] Mozhno li otkliknutsya na zayavku
- [ ] Zapros-Pomoshi — chto eto? Otdelnyy tip zayavki?
- [ ] helpRequestsSlice — kak sinhroniziruetsya s requestsSlice? Dublirovanie?
- [ ] todayItems — pravilno li schitaetsya "segodnya"
- [ ] Avto-odobrenie dlya help_neighbors — rabotaet li

**Imitatsiya polzovatelya:** Idu v "Pomoch sosedyam". Vizhu prosby. Hochu pomoch. Chto delat?

---

## ZADACHA 2.10: Redux i dannye zayavok

**Fayly dlya proverki:**
- `src/redux/slices/requestsSlice.ts`
- `src/redux/slices/helpRequestsSlice.ts`
- `src/redux/selectors.ts`
- `src/services/api.ts` (funktsii zayavok)

**Chto proveryat:**
- [ ] Thunks: submitRequest, fetchRequests, deleteRequest — vsye li obrabatyvayut oshibki
- [ ] Selektory — net li oshibok pri pustom state
- [ ] Dublirovanie dannyh mezhdu requestsSlice i helpRequestsSlice
- [ ] Race condition — chto budet pri odnovremennom submit i fetch
- [ ] Pravilno li obnavljaetsya state posle submitRequest (optimistic update?)
- [ ] Obrabatyvaetsya li sluchay kogda Firebase nedostupen
- [ ] Est li retry logika pri oshibke seti
- [ ] Memory leak — ochistaet li listener pri unmount

**Imitatsiya polzovatelya:** Otpravil zayavku. Obnovil lentu. Vizhu li svoyu zayavku?

---

## FORMAT OTCHETA ZA DEN 2

Sozdai fayl `DAY2_REPORT.md` po formatu iz `00_MASTER_PLAN.md`
