# DEN 7: ADMIN-PANEL — POLNOTA, MODERATSIYA, BEZOPASNOST
## 10 zadach dlya AI-agenta

---

## KONTEKST DLYA AGENTA

ADMIN — eto vladylets prilozhcheniya. On dolzhen imet POLNYY kontrol nad vsem chto proiskhodit.
Admin-panel — eto WEB-prilozhenie (otdyolnoe ot mobilnogo) v papke `admin-panel/`.
Segodnya my proveryaem chto ADMIN VIDIT VSE i MOZHET UPRAVLYAT VSEM.

UID admina: `fWFUJBx9jiNvqLSghyFRtK9x8KA2`
Firebase project: `chaikaua-3cd9d`

---

## ZADACHA 7.1: Dashboard (glavnaya panel)

**Fayly dlya proverki:**
- `admin-panel/src/pages/DashboardPage.tsx`

**Chto proveryat:**
- [ ] Dashboard zagruzhaetsya bez oshibok
- [ ] Statistika otobrazhaetsya (polzovateli, zayavki, foto, etc.)
- [ ] Grafiki/diagrammy rabotayut
- [ ] Dannye aktualnye (ne keshirovannye starrye)
- [ ] Vse kardy/widgety klikabelny (perekhod k detalyam)
- [ ] Chto budet esli Firebase nedostupen

**Imitatsiya admina:** Otkryl admin-panel. Chto ya vizhu? Vsya statistika na meste?

---

## ZADACHA 7.2: Moderatsiya kontenta

**Fayly dlya proverki:**
- `admin-panel/src/pages/ModerationPage.tsx`
- `admin-panel/src/services/moderationService.ts`
- `admin-panel/src/components/EditRequestModal.tsx`

**Chto proveryat:**
- [ ] Ochered moderatsii zagruzhaetsya (pending requests)
- [ ] Mozhno li odobrit zayavku
- [ ] Mozhno li otklonit zayavku (s prichioy?)
- [ ] Mozhno li redaktirovat zayavku (EditRequestModal)
- [ ] Status menyaetsya v RTDB srazu
- [ ] Mobilnoe prilozhenie vidit izmeneniya
- [ ] Pravilnyy filter — tolko pending
- [ ] Chto budet esli moderator odobrit to chto uzhe odobreno

**Imitatsiya admina:** Prishla novaya zayavka. Chitau. Odobryayu. Proveryayu na mobile.

---

## ZADACHA 7.3: Moderatsiya foto

**Fayly dlya proverki:**
- `admin-panel/src/pages/PhotoApprovalPage.tsx`
- `admin-panel/src/services/photoApprovalService.ts`

**Chto proveryat:**
- [ ] Spisok foto na moderatsii zagruzhaetsya
- [ ] Foto videt polnorazmernym
- [ ] Informatsiya o foto (avtor, data, opisanie)
- [ ] Knopki "Odobrit" / "Otklonit"
- [ ] Posle odobreniya — foto poyavlyaetsya v `/community_photos_public`
- [ ] Posle otkloneniya — foto udlyaetsya ili pomechaetsya
- [ ] Batch odobrenie — mozhno li odobrit neskolko srazu
- [ ] Chto budet esli foto v Storage udaleno a zapis ostalsa

**Imitatsiya admina:** 15 novykh foto na moderatsii. Smotryu. Odobryayu horoshie. Otklyonyayu plokhie.

---

## ZADACHA 7.4: Derevo poruchiteley (Trust Tree)

**Fayly dlya proverki:**
- `admin-panel/src/pages/GuarantorTreePage.tsx`
- `admin-panel/src/services/guarantorTreeService.ts`
- `admin-panel/src/components/ChainVisualization.tsx`
- `admin-panel/src/components/FullTreeView.tsx`

**Chto proveryat:**
- [ ] Derevo otobrazhaetsya (vizualizatsiya)
- [ ] Vsye polzovateli vidny v dereve
- [ ] Svyazi mezhdu poruchitelyami i priglashennymi korrektny
- [ ] Glubina (depthToRoot) pravilna
- [ ] FullTreeView — mozhno li razvernut/svernut vetki
- [ ] Poisk polzovatelya v dereve
- [ ] Chto budet esli derevo ochen bolshoe (performance)
- [ ] Sinhronizatsiya s mobilnym prilozheniem

**Imitatsiya admina:** Hochu uvidet kto kogo priglasil. Otkryvayu derevo. Vsyo vidno?

---

## ZADACHA 7.5: Upravlenie dostupom i invite

**Fayly dlya proverki:**
- `admin-panel/src/pages/InviteAccessPage.tsx`
- `admin-panel/src/pages/AccessControlPage.tsx`
- `admin-panel/src/services/inviteAccessService.ts`
- `admin-panel/src/services/accessControlService.ts`

**Chto proveryat:**
- [ ] Spisok zayavok na dostup
- [ ] Mozhno li odobrit/otklonit zayavku
- [ ] Mozhno li zablokirovat polzovatelya
- [ ] Mozhno li razblokirovat
- [ ] Mozhno li izmenit rol (resident → manager)
- [ ] Spisok vsekh polzovateley s ikh statusami
- [ ] Filter po statusu (pending, approved, blocked)
- [ ] VAZHNO: net li sposobov oboyti kontrola dostupa

**Imitatsiya admina:** Novyy polzovatel prosit dostup. Proveryayu. Odobryayu. On poluchaet dostup?

---

## ZADACHA 7.6: Bezopasnost

**Fayly dlya proverki:**
- `admin-panel/src/pages/SecurityPage.tsx`
- `admin-panel/src/services/securityService.ts`

**Chto proveryat:**
- [ ] Ekran bezopasnosti otkryvaetsya
- [ ] Kakie instrumenty bezopasnosti dostupny adminu
- [ ] Mozhno li prosmatrivat logi dostupa
- [ ] Mozhno li videt podozritelnuyu aktivnost
- [ ] securityService — kakie funktsii dostupny
- [ ] Est li alert o bezopasnosti (vzlom, spam, etc.)

**Imitatsiya admina:** Podozrevayu zloupotreblenie. Gde posmotret logi?

---

## ZADACHA 7.7: Monitoring oshibok i diagnostika

**Fayly dlya proverki:**
- `admin-panel/src/pages/ErrorMonitorPage.tsx`
- `admin-panel/src/pages/AIDiagnosticsPage.tsx`
- `admin-panel/src/services/errorMonitorService.ts`
- `admin-panel/src/services/aiDiagnosticsService.ts`
- `admin-panel/src/components/LiveDiagnosticsPanel.tsx`

**Chto proveryat:**
- [ ] Oshibki polzovateley vidny adminu
- [ ] Mozhno li filtirovat po tipu, polzovatelyu, date
- [ ] AI diagnostika — chto eto? Rabotaet li?
- [ ] Live panel — obnovlyaetsya li v realnom vremeni
- [ ] Dostatochen li kontekst oshibki (stack trace, user info, device)
- [ ] Mozhno li otmetit oshibku kak reshennuyu

**Imitatsiya admina:** Polzovateli zhaluyutsya na bag. Gde posmotret oshibki?

---

## ZADACHA 7.8: Pravila Firebase i biznes-logika

**Fayly dlya proverki:**
- `admin-panel/src/pages/AppRulesPage.tsx`
- `admin-panel/src/services/appRulesService.ts`
- `admin-panel/src/services/firebaseRulesParser.ts`
- `admin-panel/src/components/AppRulesSectionTable.tsx`

**Chto proveryat:**
- [ ] Pravila otobrazhauyutsya
- [ ] Mozhno li redaktirovat pravila
- [ ] Parsyatsya li Firebase Security Rules korrektno
- [ ] Tablitsa — ponyatna li adminu
- [ ] Net li opasnyh otkrytykh pravil (read: true, write: true bez usloviy)
- [ ] VAZHNO: eto redaktor pravil ili tolko prosmotr?

**Imitatsiya admina:** Hochu proverit pravila bezopasnosti bazy dannyh.

---

## ZADACHA 7.9: Premium, bonusy, reklama

**Fayly dlya proverki:**
- `admin-panel/src/pages/PremiumPage.tsx`
- `admin-panel/src/pages/BonusCreditsPage.tsx`
- `admin-panel/src/pages/BusinessPlusModerationPage.tsx`
- `admin-panel/src/pages/AdChatPage.tsx`
- `admin-panel/src/services/premiumAdminService.ts`
- `admin-panel/src/services/bonusAdminService.ts`
- `admin-panel/src/services/businessPlusAdminService.ts`

**Chto proveryat:**
- [ ] Premium upravlenie — mozhno li aktivirovat/deaktivirovat polzovatelyu
- [ ] Bonusy — mozhno li nachislit/spisat vruchnu
- [ ] Business Plus — moderatsiya zayavok ot biznesov
- [ ] Reklama (AdChat) — upravlenie reklamoy v prilozhenii
- [ ] Vse servisy rabotayut (ne pustye stranichki)
- [ ] Dannyye sinhronizirovany s mobilnym prilozheniem

**Imitatsiya admina:** Hochu dat polzovatelyu Premium na mesyats. Kak?

---

## ZADACHA 7.10: Obshchaya proverka admin-paneli

**Fayly dlya proverki:**
- `admin-panel/src/pages/LoginPage.tsx`
- `admin-panel/src/pages/ReleasesPage.tsx`
- `admin-panel/src/pages/SupportPage.tsx`
- `admin-panel/src/pages/ArchivePage.tsx`
- `admin-panel/src/services/releasesService.ts`
- `admin-panel/src/services/supportService.ts`

**Chto proveryat:**
- [ ] Login — tolko admin mozhet voyti (proverka roli)
- [ ] Chto budet esli obychnyy polzovatel popyataetsya voyti
- [ ] Releases — upravlenie versiyami prilozhcheniya
- [ ] Support — vhodnye obrashcheniya ot polzovateley
- [ ] Mozhno li otvetit polzovatelyu iz admin-paneli
- [ ] Archive — chto tam, dostupno li
- [ ] OBSHCHEE: VSE LI STRANITSY ADMIN-PANELI RABOTAYUT?
- [ ] Net li strantis-zaglushek (pustye ili "coming soon")
- [ ] Navigatsiya — vse ssylki v menyu vedut kuda nado
- [ ] Responsiveness — rabotaet li na planshete

**Imitatsiya admina:** Prokhozhus po VSEM razdelam admin-paneli. Vsyo rabotaet?

---

## ITOGOVY FORMAT

Posle dnya 7 sozdai DOPOLNITELNO fayl `FINAL_SUMMARY.md`:

```markdown
# ITOGY NEDELI AUDITA
## Prilozhenie: Chaika Life v1.1.419
## Period: [daty]
## Agent: DeepSeek v4

### OBSHCHAYA STATISTIKA
- Vsego provereno faylov: [chislo]
- Vsego naydeno bagov: [chislo]
  - CRITICAL: [chislo]
  - HIGH: [chislo]
  - MEDIUM: [chislo]

### TOP-10 KRITICHESKIH BAGOV
[spisok s prioritetom]

### REKOMENDATSII PO ISPRAVLENIYU
[poryadok raboty dlya Claude Sonnet]

### GOTOVNOST K PUBLIKATSII
[otsenka v % — skolko eshcho rabot]
```
