# DEN 6: OSBB, BIZNES, SERVISY, NOVOSTI, PODDERZHKA
## 10 zadach dlya AI-agenta

---

## KONTEKST DLYA AGENTA

Polzovatel — zhitel Chayki, uchastnik OSBB (obedineniye sovladeltsev) ili vladelets biznesa.
Eto bolye slozhnyye funktsii prilozhcheniya, no oni vazhny dlya aktivnykh polzovateley.

---

## ZADACHA 6.1: OSBB Hub (glavnyy ekran OSBB)

**Fayly dlya proverki:**
- `src/screens/OSBB-Hub.tsx`
- `src/screens/OSBB-Setup.tsx`
- `src/redux/slices/osbbSlice.ts`

**Chto proveryat:**
- [ ] Hub otkryvaetsya — vse sektsii vidny
- [ ] Setup — mozhno li prisoedinitsa k OSBB
- [ ] Vybor doma — rabotaet li
- [ ] osbbSlice — pravilno li sohranyaet buildingId, role
- [ ] Razlichiya mezhdu resident i osbb_manager rolyami
- [ ] Chto vidit polzovatel kotoryy NE v OSBB
- [ ] Chto vidit polzovatel kotoryy v OSBB
- [ ] managerVerification — kak proishodit

**Imitatsiya polzovatelya:** Hochu prisoedinitsya k OSBB moego doma. Kak? Gde?

---

## ZADACHA 6.2: OSBB Novosti

**Fayly dlya proverki:**
- `src/screens/OSBB-Novosti.tsx`
- `src/screens/OSBB-AddNews.tsx`
- `src/services/osbbNews.ts`

**Chto proveryat:**
- [ ] Spisok novostey doma zagruzhaetsya
- [ ] Novost otobrazhaetsya polnostyu (zagolovok, tekst, data, avtor)
- [ ] Dobavlenie novosti — tolko dlya manager?
- [ ] OSBB-AddNews — forma rabotayet (zagolovok, tekst, foto)
- [ ] Validatsiya formy
- [ ] Sokhranenie v Firebase
- [ ] Mozhno li redaktirovat/udalit novost

**Imitatsiya polzovatelya (manager):** Hochu napisat novost dlya zhitelley doma. Kak?

---

## ZADACHA 6.3: OSBB Golosovanie

**Fayly dlya proverki:**
- `src/screens/OSBB-Golosovanie.tsx`
- `src/services/osbbVotingService.ts`

**Chto proveryat:**
- [ ] Spisok golosovaniy zagruzhaetsya
- [ ] Mozhno li progolosovat
- [ ] Odnorazovoye golosovanie — nelzya golosovat dvazhdy?
- [ ] Rezultaty — otobrazhauyutsya li (protsenty, grafik)
- [ ] Sozdanie golosovaniya — tolko dlya manager?
- [ ] Sroky golosovaniya — korrektny li
- [ ] Chto budet esli golosovanie zaversheno
- [ ] Bezopasnost — mozhno li falnitsifitsirovat golos

**Imitatsiya polzovatelya:** V dome golosovanie za remont. Hochu progolosovat.

---

## ZADACHA 6.4: OSBB Finansy i sbory

**Fayly dlya proverki:**
- `src/screens/OSBB-Finansy.tsx`
- `src/screens/OSBB-Sbor.tsx`
- `src/services/osbbCollections.ts`

**Chto proveryat:**
- [ ] Ekran finansov — chto vidno (balans, raskhody, dokhody)
- [ ] Sbory — spisok aktivnykh sborov
- [ ] Mozhno li vnesti oplatu
- [ ] Istoriya platzhey — est li
- [ ] Pravilno li schitaetsya obshchaya summa
- [ ] Tolko manager mozhet sozdat sbor?
- [ ] Chto budet esli net aktivnykh sborov

**Imitatsiya polzovatelya (zhitel):** Skol'ko ya dolzhen za obsluzhivanie? Gde zaplatit?

---

## ZADACHA 6.5: OSBB Admin Panel

**Fayly dlya proverki:**
- `src/screens/OSBB-AdminPanel.tsx`
- `src/services/osbbHouseTopicsService.ts`

**Chto proveryat:**
- [ ] Dostupno TOLKO dlya osbb_manager roli
- [ ] Vse funktsii upravleniya rabotayut
- [ ] Temy doma — mozhno li sozdat/redaktirovat
- [ ] Chto budet esli obychnyy polzovatel poprobyet otkryt
- [ ] Net li uyazvimostey v proverke roli

**Imitatsiya polzovatelya (manager):** Ya predsedatel OSBB. Hochu upravlyat domom.

---

## ZADACHA 6.6: Biznes katalog

**Fayly dlya proverki:**
- `src/screens/Bizznes-Chaika.tsx`
- `src/screens/BusinessClaimScreen.tsx`
- `src/screens/BusinessMenuEditorScreen.tsx`
- `src/screens/BusinessPromoEditorScreen.tsx`
- `src/screens/BusinessPlusSubscriptionScreen.tsx`
- `src/components/BusinessApprovalModal.tsx`

**Chto proveryat:**
- [ ] Spisok biznesov zagruzhaetsya
- [ ] Kartochka biznesa — informatsiya polnaya
- [ ] Zayavka na vladenie biznesom (BusinessClaimScreen) — rabotaet li forma
- [ ] Redaktor menyu — mozhno li dobavit/redaktirovat pozitsii
- [ ] Redaktor promoktsiy — rabotaet li
- [ ] Business Plus podpiska — chto vklyuchayet
- [ ] VNIMANIE: Bizznes-Chaika — izvestnyy bug s Viber (kak i Kontakt-XXX)
  - handleViber() — est li proverka avtorizatsii?

**Imitatsiya polzovatelya (vladelets kafe):** Hochu zaregistrirovat svoyo kafe v prilozhenii.

---

## ZADACHA 6.7: Novosti i obyavleniya

**Fayly dlya proverki:**
- `src/screens/Obiavleniya.tsx`
- `src/screens/Vazhnye-Novosti-Chayki.tsx`
- `src/screens/ImportantNewsScreen.tsx`
- `src/services/chaykaNewsService.ts`
- `src/services/chaykaNewsIntelligence.ts`

**Chto proveryat:**
- [ ] Obiavleniya — zagruzhayutsya li
- [ ] Vazhnye novosti — otobrazhauyutsya li s prioritetom
- [ ] ImportantNewsScreen — v chyom raznitsa s Vazhnye-Novosti?
- [ ] newsService — otkuda berut dannye
- [ ] newsIntelligence — chto eto? AI-generirovannye novosti?
- [ ] Pravilnyy poryadok (novyye sverkhu)
- [ ] Mozhno li podelitsa novostyu

**Imitatsiya polzovatelya:** Hochu uznat novosti Chayki. Gde posmotret?

---

## ZADACHA 6.8: Status sveta (elektrichestvo)

**Fayly dlya proverki:**
- `src/screens/Status-Sveta.tsx`
- `src/redux/slices/electricitySlice.ts`

**Chto proveryat:**
- [ ] Ekran statusa sveta otkryvaetsya
- [ ] Dannye zagruzhayutsya (segodnyashnie otchety)
- [ ] Informatsiya ponyatna polzovatelyu
- [ ] Posledney otchyot — vremya pravilnoe
- [ ] Mozhno li soobshchit o vyklyuchenii
- [ ] electricitySlice — pravilno li obnovlyaetsya

**Imitatsiya polzovatelya:** Vyklyuchili svet. Hochu uznat kogda vklyuchat. Gde posmotret?

---

## ZADACHA 6.9: QR-kod i skachivanie

**Fayly dlya proverki:**
- `src/screens/QR-Kod.tsx`
- `src/screens/Ekran-Koda-Zagruzki.tsx`
- `src/services/apkInstallService.ts`
- `src/services/apkDownloadTracker.ts`

**Chto proveryat:**
- [ ] QR-kod generiruyetsya pravilno
- [ ] Mozhno li otskanirovat (vedet li na pravilnuyu ssylku)
- [ ] Ekran-Koda-Zagruzki — dlya chego on (skachat APK?)
- [ ] apkInstallService — pravilno li otslezhivaet ustanovki
- [ ] apkDownloadTracker — korrektnaya li analitika
- [ ] QR dlya chego — dlya priglasheniya? Dlya skachivaniya?

**Imitatsiya polzovatelya:** Hochu podelitsya prilozheniem s sosedom. Pokazyvayu QR.

---

## ZADACHA 6.10: Spisok pokupok i uslugi

**Fayly dlya proverki:**
- `src/screens/Spisok-Pokupok.tsx`
- `src/screens/servicesHub.tsx`
- `src/screens/Onlayn-Chat.tsx`

**Chto proveryat:**
- [ ] Spisok pokupok — chto eto? (grocery helper?)
- [ ] Mozhno li sozdat/redaktirovat spisok
- [ ] Sokhranuyetsya li spisok
- [ ] servicesHub — vse ssylki rabotayut
- [ ] Onlayn-Chat — otkryvaetsya li, rabotaet li
- [ ] Chat — kuda idut soobshcheniya (Firebase RTDB? Cloud Functions?)
- [ ] Est li uvedomleniya o novykh soobshcheniyakh

**Imitatsiya polzovatelya:** Sobiraus v magazin. Hochu sozdat spisok pokupok v prilozhenii.

---

## FORMAT OTCHETA ZA DEN 6

Sozdai fayl `DAY6_REPORT.md` po formatu iz `00_MASTER_PLAN.md`
