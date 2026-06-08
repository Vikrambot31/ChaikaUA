# PLAN AUDITA MOBILNOGO PRILOZHENIYA "CHAIKA LIFE"
## Nedelniy plan dlya AI-agenta DeepSeek v4
## Data sozdaniya: 2026-06-08

---

## TSELI

1. **Nayti vse kriticheskie / vysokie / srednie bagi** — ekrany, knopki, funktsii, zagruzka, pravila
2. **Snizit nagruzku na Claude Sonnet** — agent nahodit i opisyvaet KONKRETNO: fayl, stroka, problema
3. **Podgotovka k publikatsii** — proverka vsego, chem budut polzovatsa realnye polzovateli
4. **Proverka admin-paneli** — polnota dostupa admina ko vsem dannym i deystviyam

---

## STRUKTURA NEDELI (7 dney, do 10 zadach v den)

| Den | Fokus | Fayly zadach |
|-----|-------|--------------|
| **Den 1** | Autentifikatsiya, registratsiya, onboarding | `DAY1_AUTH_ONBOARDING.md` |
| **Den 2** | Glavnyy ekran, lenta zayavok, sozdanie zayavok | `DAY2_FEED_REQUESTS.md` |
| **Den 3** | Mesta, karta, spravochnik, katalogi | `DAY3_PLACES_DIRECTORY.md` |
| **Den 4** | Foto-sistema, zagruzka, moderatsiya, galeriya | `DAY4_PHOTO_SYSTEM.md` |
| **Den 5** | Profil, nastroyki, podpiska, bonusy, poruchitel | `DAY5_PROFILE_PREMIUM_GUARANTOR.md` |
| **Den 6** | OSBB, biznes, servisy, novosti, podderzhka | `DAY6_OSBB_BUSINESS_SUPPORT.md` |
| **Den 7** | Admin-panel: polnota, moderatsiya, bezopasnost | `DAY7_ADMIN_PANEL.md` |

---

## PRAVILA DLYA AGENTA (OBYAZATELNO PROCHITAY PERED RABOTOY)

### Kak iskat bagi BEZ gallyutsinatsiy

1. **VSEGDA OTKRYVAY FAYL i CHITAY KOD** — ne ugadyvay, ne predpolagay. Otkroy fayl, prochitay funkstsiyu, potom pishi otchet.

2. **UKAZYVAY TOCHNO:**
   - Polnyy put k faylu: `src/screens/Vkhod.tsx`
   - Nomer stroki: `stroka 142`
   - Imya funktsii/komponenta: `handleLogin()`
   - Fragment koda (5-10 strok) kotoryy soderzhit problemu

3. **KATEGORII BAGOV:**
   - **CRITICAL** — prilozhenie padaet, dannye teryayutsya, bezopasnost narushena
   - **HIGH** — funktsiya ne rabotaet, ekran ne otkryvaetsya, knopka ne reagiruet
   - **MEDIUM** — nepravilnoe otobrazhenie, nevernye dannye, plohoy UX
   - **LOW** — kosmetika, opechitki (NO my ih NE ishchem na etoy nedele)

4. **NE PISHI "VOZMOZHNO" ili "NAVERNOE"** — libo ty nashel bag, libo net. Esli ne uveren — prover eshche raz.

5. **FORMAT OTCHETA dlya kazhdogo baga:**
```
### BUG-[NOMER]: [Kratkoe opisanie]
- **Severity:** CRITICAL / HIGH / MEDIUM
- **Fayl:** `src/screens/Vkhod.tsx`
- **Stroka:** 142-155
- **Funktsiya:** `handleLogin()`
- **Problema:** [Chto imenno ne tak]
- **Kod:**
```typescript
// problemniy fragment koda (5-10 strok)
```
- **Ozhidaemoe povedenie:** [Kak dolzhno rabotat]
- **Fakticheskoe povedenie:** [Chto proiskhodit na samom dele]
- **Kak vosproizvesti:** [Shagi polzovatelya]
```

### Kak imitirovat polzovatelya

Pered kazhdoy zadachey PREDSTAV SEBYA POLZOVATELEM:
- Ty otkryvaesh prilozhenie PERVYY RAZ
- Ty ne znaesh kak ono rabotaet
- Ty zhivesh v Chayke i hochesh:
  - Zaregistrirovatsya
  - Poprosit sosedey o pomoshi
  - Nayti kafe/magazin/salon
  - Zagruzit foto
  - Uvidet novosti doma
- Ty ne programmist — ty obychnyy polzovatel s telefonom

### Chto KONKRETNO iskать

1. **Padenie ekrana** — nezashchishchennye `undefined`, otsutstvie `?.` operatora
2. **Knopka bez deystviya** — onPress={undefined} ili pustyye handlery
3. **Zagruzka bez indikatsii** — net loading state, polzovatel ne ponimaet chto proiskhodit
4. **Oshibki navigatsii** — nevernye imena ekranov, otsutstvuyushchie parametry
5. **Oshibki form** — net validatsii, nevernaya validatsiya, zablokirovannaya otpravka
6. **Oshibki Firebase** — otsutstvie await, neobrabotannye oshibki, nevernye puti
7. **Oshibki dostupa** — mozhno li gost uvidet to chto ne dolzhen
8. **Hardcoded stroki** — tekst na angliyskom vmesto ukrainskogo/russkogo
9. **Sostoyaniya zaglushek** — pustoy ekran kogda net dannyh, net soobshcheniya ob oshibke
10. **Bezopasnost** — otkrytye endpointy, otsutstvie proverki roli

---

## KLYUCHEVYE FAYLY PRILOZHENIYA (karta kodovoy bazy)

### Ekrany (98 ekranov v `src/screens/`)
### Komponenty (57 v `src/components/`)
### Redux (10 slaysov v `src/redux/slices/`)
### Servisy (70+ v `src/services/`)
### Utility (45+ v `src/utils/`)
### Admin panel (18 stranits v `admin-panel/src/`)
### Tipy (`src/types/app.ts`)
### Navigatsiya (`src/navigation/RootNavigator.tsx`)

---

## OZHIDAEMYY REZULTAT

Posle nedeli audita dolzhen byt:
- **Spisok vseh bagov** s tochnym ukazaniem fayla/stroki/problemy
- **Prioritezatsiya** — chto chinnit PERVYM (CRITICAL > HIGH > MEDIUM)
- **Gotovyye zadachi dlya Claude Sonnet** — kazhdyy bag = odna konkretna zadacha s kontekstom
- **Otchet po admin-paneli** — vse li vidno adminu, vse li rabotaet

---

## VAZHNO

Agent NE DOLZHEN:
- Ispravlyat kod (tolko audit!)
- Pisat "ya ne mogu proverit" — ty mozhesh, otkroy fayl i prochitay
- Propuskat fayly — proveryay KAZHDYY fayl iz spiska zadachi
- Gallyutsinnirovat — esli ne nashel baga, pishi "Bag ne obnaruzhen"
