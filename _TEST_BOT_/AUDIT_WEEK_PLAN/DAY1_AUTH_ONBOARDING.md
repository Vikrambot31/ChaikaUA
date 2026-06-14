# DEN 1: AUTENTIFIKATSIYA, REGISTRATSIYA, ONBOARDING
## 10 zadach dlya AI-agenta

---

## KONTEKST DLYA AGENTA

Polzovatel otkryvaet prilozhenie PERVYY RAZ. On dolzhen:
1. Uvidet splash-ekran i onboarding slaydy
2. Vybrat yazyk
3. Voyti ili zaregistrirovatsya
4. Zapolnit profil, vybrat dom, vybrat avatar
5. Poluchit dostup k prilozheniyu

Tvoya zadacha — proyti etot put vmeste s kodom i nayti VSE mesta gde chto-to mozhet slomat'sya.

---

## ZADACHA 1.1: Splash-ekran i animatsiya

**Fayly dlya proverki:**
- `src/components/SplashAnimation.tsx`
- `App.tsx` (inicializatsiya)

**Chto proveryat:**
- [ ] Zagruzhaetsya li animatsiya bez oshibok
- [ ] Est li fallback esli animatsiya ne zagruzilas
- [ ] Pravilno li rabotaet perekhod ot splash k onboarding
- [ ] Net li `undefined` v props animatsii
- [ ] Rabotaet li na Web (est li platform-specific kod)

**Imitatsiya polzovatelya:** Otkryl prilozhenie, zhdet zagruzku. Chto on vidit? Chto mozhet poyti ne tak?

---

## ZADACHA 1.2: Onboarding slaydy

**Fayly dlya proverki:**
- `src/components/OnboardingSlides.tsx`
- `src/components/FirstLaunchOnboarding.tsx`
- `src/components/InviteAccessIntroSlides.tsx`

**Chto proveryat:**
- [ ] Vse li slaydy otobrazhauyutsya (kartinki, tekst)
- [ ] Rabotayet li svayp mezhdu slaydami
- [ ] Rabotayet li knopka "Dalee" / "Propustit"
- [ ] Est li knopka "Propustit" na poslednem slayde (ne dolzhna byt)
- [ ] Pravilno li sohraenyaetsya flag "onboarding proyden" (AsyncStorage)
- [ ] Chto budet esli AsyncStorage nedostupen

**Imitatsiya polzovatelya:** Smotryu slaydy, svaypayu, nazhal "Propustit". Vsyo ok?

---

## ZADACHA 1.3: Vybor yazyka

**Fayly dlya proverki:**
- `src/components/LanguagePickerOnboarding.tsx`
- `src/components/LanguageSelector.tsx`
- `src/redux/slices/languageSlice.ts`

**Chto proveryat:**
- [ ] Vse 3 yazyka dostupny (UA, RU, EN)
- [ ] Sohranyaetsya li vybor v Redux i AsyncStorage
- [ ] Menyaetsya li interfeys srazu posle vybora
- [ ] Chto budet esli yazyk ne vybran — est li default
- [ ] Net li hardcoded strok mimo i18n sistemy

**Imitatsiya polzovatelya:** Vybral ukrainskiy. Perezapustil prilozhenie. Yazyk sohranyaetsya?

---

## ZADACHA 1.4: Ekran vkhoda (login)

**Fayly dlya proverki:**
- `src/screens/Vkhod.tsx`
- `src/services/authSessionService.ts`
- `src/utils/rateLimiter.ts`

**Chto proveryat:**
- [ ] Validatsiya email (format, pustoe pole)
- [ ] Validatsiya parolya (minimum 6 simvolov)
- [ ] Otobrazhaetsya li oshibka pri nevernom logine
- [ ] Rabotaet li rate limiting (5 popytok = blokirovka)
- [ ] Otobrazhaetsya li soobshchenie o blokirovke
- [ ] Rabotayut li knopki Google / Facebook / Apple login
- [ ] Est li loading indikator pri vhode
- [ ] Chto budet esli servep nedostupen (net interneta)
- [ ] Knopka "Zabyl parol" — rabotaet li?
- [ ] Perekhod k registratsii — rabotaet li?

**Imitatsiya polzovatelya:** Vvozhu email i parol. Nazhal "Voyti". Zhdu. Oshibka? Loading? Nichego?

---

## ZADACHA 1.5: Sotsialnaya autentifikatsiya

**Fayly dlya proverki:**
- `src/screens/Vkhod.tsx` (knopki sotsialnyh setey)
- `App.tsx` (inicializatsiya Google/Facebook SDK)
- `src/services/authProfileService.ts`

**Chto proveryat:**
- [ ] Google Sign-In — pravilno li nastroeny clientId dlya iOS/Android/Web
- [ ] Facebook Login — est li appId, pravilnyy li scope
- [ ] Apple Sign-In — tolko na iOS ili pokazyvaetsya vezde?
- [ ] Chto budet esli polzovatel otmenil vhod cherez Google
- [ ] Chto budet esli email uzhe zaregistrirovan cherez drug provider
- [ ] Sozdaetsya li profil v Firebase posle pervogo vkhoda
- [ ] Pravilno li obrabatyvayutsya oshibki kazhdogo providera

**Imitatsiya polzovatelya:** Nazhal "Voyti cherez Google". Vybral akkaunt. Chto dalshe?

---

## ZADACHA 1.6: Polnaya registratsiya

**Fayly dlya proverki:**
- `src/screens/Registraciya-Polnaya.tsx`
- `src/utils/validators.ts`
- `src/utils/validationMessages.ts`
- `src/utils/passwordBreachCheck.ts`

**Chto proveryat:**
- [ ] Vse polya formy prisutstvuyut (imya, email, telefon, dom, kvartira, parol)
- [ ] Validatsiya kazhdogo polya:
  - Imya: min 2 simvola, tolko bukvy
  - Email: korrektnyy format
  - Telefon: ukrainskiy format (+380...)
  - Parol: min 6 simvolov, ne v baze utechek (HIBP)
  - Powtorenie parolya: sovpadaet
- [ ] Vybor doma — otkryvaetsya li spisok, mozhno li vybrat
- [ ] Pole poruchitelya — chto budet esli vvesti neizvestnyy nomer
- [ ] Knopka "Zaregistrirovatsya" — aktivna tolko kogda vse polya zapolneny
- [ ] Loading indikator pri otpravke
- [ ] Oshibki servera — kak otobrazhauyutsya
- [ ] Dublikat email — chto budet
- [ ] Checkbox "Soglasie s pravilami" — est li, rabotaet li

**Imitatsiya polzovatelya:** Zapolnyayu vse polya. Nazhal "Registratsiya". Zhdu...

---

## ZADACHA 1.7: Vybor avatara

**Fayly dlya proverki:**
- `src/screens/StartAvatarPickerScreen.tsx`
- `src/utils/startAvatars.ts`
- `src/utils/userAvatar.ts`

**Chto proveryat:**
- [ ] Otobrazhauyutsya li vse 6 avatarov (3 muzhskih, 3 zhenskih)
- [ ] Pravilno li sootneseny avatary s polom polzovatelya
- [ ] Mozhno li propustit vybor avatara
- [ ] Sohranyaetsya li avatar v profil Firebase
- [ ] Est li loading pri sohranyenii
- [ ] Chto budet esli zagruzit svoe foto vmesto avatara
- [ ] Metadannye: Muzhskiye: 1 (35-55), 3 (<30), 4 (55+); Zhenskiye: 2 (<30), 5 (35-55), 6 (50+)

**Imitatsiya polzovatelya:** Registratsiya zavershena. Vyberayu avatar. OK? Propusk?

---

## ZADACHA 1.8: Nastroyka profilya

**Fayly dlya proverki:**
- `src/screens/ProfileSetupScreen.tsx`
- `src/services/authProfileService.ts`

**Chto proveryat:**
- [ ] Vse polya profilya dostupny i editiruyemy
- [ ] Predgapolnenny li dannye iz registratsii (imya, email)
- [ ] Sohranyaetsya li profil v Firebase `/users/{uid}`
- [ ] Obrabotka oshibok pri sohranyenii
- [ ] Perekhod posle sohranyeniya — kuda?
- [ ] Chto budet esli zakryt prilozhenie poseredine nastroyki

**Imitatsiya polzovatelya:** Zaregistrirovalsya. Nastoivayu profil. Sohranyu. Kuda menya perenesut?

---

## ZADACHA 1.9: Kontrol dostupa posle registratsii

**Fayly dlya proverki:**
- `src/components/AppAccessGuard.tsx`
- `src/components/SoftInviteAccessGate.tsx`
- `src/screens/AccessRestrictedScreen.tsx`
- `src/screens/PendingApprovalScreen.tsx`
- `src/utils/accessControl.ts`
- `src/services/securityRoles.ts`

**Chto proveryat:**
- [ ] Novyy polzovatel — kakoy u nego status (pending? temporary? approved?)
- [ ] Vidny li emu vse ekrany ili tolko chast?
- [ ] Esli status "pending" — chto on vidit? Est li soobshchenie?
- [ ] Esli ban — pokazyvaetsya li BlockedScreen?
- [ ] Esli gost (anonymous auth) — chto emu dostupno?
- [ ] Pravilno li AppAccessGuard proveryaet roli
- [ ] Net li sposobov oboyti proverku dostupa (obkhod SoftInviteAccessGate)

**Imitatsiya polzovatelya:** Zaregistrirovalsya. Zhdu odobreniya. Chto ya vizhu? Mogu li ya chto-to delat?

---

## ZADACHA 1.10: Obshchie problemy autentifikatsii

**Fayly dlya proverki:**
- `src/redux/slices/authSlice.ts`
- `src/services/firebase-auth-session.ts`
- `src/services/sessionService.ts`
- `src/services/deviceAuth.ts`
- `src/utils/authGuard.ts`

**Chto proveryat:**
- [ ] Sohranenyaetsya li sessia posle perezapuska (Redux Persist + AsyncStorage)
- [ ] Pravilno li rabotaet logout (ochistaet li vse dannye)
- [ ] Chto budet esli token istchyok (Firebase auto-refresh)
- [ ] Pravilno li obnolvlyaetsya FCM token pri logine
- [ ] deviceAuth — chto eto i zachem? Est li uyazvimosti?
- [ ] Obrabotka oshibok pri potere seti vo vremya logina
- [ ] Nelzya li voyti pod drugogo polzovatelya bez logout
- [ ] Obsluzhivayutsya li vse sostoyaniya authSlice (loading, error, authenticated)

**Imitatsiya polzovatelya:** Voshel v prilozhenie. Zakryl ego. Otkryl cherez chas. Ya vsyo eshche v sisteme?

---

## FORMAT OTCHETA ZA DEN 1

Sozdai fayl `DAY1_REPORT.md` s takim formatom:

```markdown
# OTCHET ZA DEN 1: AUTENTIFIKATSIYA I ONBOARDING
## Data: [data]
## Agent: DeepSeek v4

### STATISTIKA
- Provereno faylov: [chislo]
- Naydeno bagov: [chislo]
  - CRITICAL: [chislo]
  - HIGH: [chislo]
  - MEDIUM: [chislo]

### NAYDENNYE BAGI
[spisok po formatu iz MASTER_PLAN]

### PROVERENNYE FAYLY BEZ BAGOV
[spisok faylov gde vsyo OK]

### REKOMENDATSII
[chto nado ispravit PERVYM]
```
