# Rabel — Revisione tecnica della repository

**Data:** 19 novembre 2026
**Branch analizzato:** `arena/6fce9756-rabbel` (base `4ca8006`, merge della PR #8)
**Stato test automatici:** 11/11 verdi (`node --test`)

---

## 0. Mappa della repository

| Percorso | Ruolo | Stato |
|---|---|---|
| `index.html` (1,6 MB) | Sito pubblico del menù. Snapshot statico completo + sincronizzazione live da Supabase | Attivo, molto pesante |
| `supabase-live.js` | Lettura anonima delle 4 tabelle e applicazione al DOM | Attivo |
| `app/index.html`, `app/client.js`, `app/domain.js`, `app/ui.js` | Pannello di gestione (piatti, foto, orari, info) | Attivo |
| `app/capability.js` | Chiave tecnica iniettata a build-time | **Assente dal repo (gitignored)** |
| `android/` | Wrapper WebView che serve `app/` da `appassets.androidplatform.net` | Attivo |
| `supabase/functions/rabel-app/index.ts` | Edge Function proxy con service-role | Attivo |
| `supabase/migrations/*.sql` | 4 migrazioni: schema, categorie/orari, riordino, owner/service-role | Attivo |
| `downloads/Rabel-Gestione.apk` (28 KB) | APK di prova committato | **Contiene la chiave tecnica in chiaro** |
| `admin.html` (40 KB) | Vecchio pannello Google Apps Script | **Codice morto** |
| `manifest.json` | PWA che punta a `admin.html` | **Obsoleto** |
| `icons/`, `foto/`, `import/`, `scripts/` | Asset e utilità | In parte non utilizzati |
| `tests/` | 5 file di test (`node:test`) | Attivi, ma fuori dalla CI |

Architettura in sintesi: il sito è autosufficiente (snapshot incorporato) e si aggiorna via REST pubblico con chiave *publishable* e RLS in sola lettura; il pannello scrive passando da una Edge Function che usa la *service role* autenticando la richiesta con una chiave condivisa embedded nell'APK.

---

## 1. Bug ed errori

### P0 — Sicurezza / bloccanti

#### B1. La chiave tecnica è pubblicata dentro un repository pubblico
`downloads/Rabel-Gestione.apk` → `assets/capability.js`

L'APK committato contiene la chiave a 64 caratteri esadecimali in chiaro (verificata con `unzip -p ... assets/capability.js`). La repository `SieteCreator/Rabbel` è **pubblica**. Chiunque può:

1. scaricare l'APK, estrarre la chiave;
2. chiamare `https://<progetto>.supabase.co/functions/v1/rabel-app/rest/v1/rabel_dishes` con l'header `x-rabel-app-key`;
3. leggere, modificare o **cancellare** piatti, categorie, orari, info e caricare foto (la Edge Function usa la service-role, quindi RLS è bypassata).

Il rischio è già descritto in `downloads/README.md`, ma resta il problema numero uno.

**Correzione immediata**
```bash
# 1. generare una nuova chiave
openssl rand -hex 32
# 2. salvarne l'hash SHA-256 nel secret RABEL_APP_TOKEN_HASH della Edge Function
printf '%s' "$NUOVA_CHIAVE" | sha256sum
# 3. rimuovere l'APK dal repo pubblico (git rm + release privata o asset cifrato)
```
A regime: sostituire la chiave condivisa con **Supabase Auth** (vedi §4.3). Le policy `rabel_owners` / `rabel_is_owner()` e i grant per `authenticated` esistono già nelle migrazioni: manca solo il login nell'app.

#### B2. `app/capability.js` è indispensabile ma non è nel repository
`.gitignore:7`, `app/index.html:216`, `app/client.js:9`

`app/index.html` carica `capability.js` come primo script e `RabelClient` rifiuta qualunque chiamata senza una chiave valida. Il file è intenzionalmente ignorato da Git e viene creato solo dalla CI con **64 zeri** (`.github/workflows/android-build.yml`), quindi:

- chi clona la repo e apre `app/index.html` vede solo il banner «Questa build non contiene la chiave tecnica»;
- una build locale di `assembleDebug` produce un APK inutilizzabile;
- non esiste alcuno script/documentazione che spieghi come rigenerare il file.

**Correzione**: aggiungere un `scripts/build-apk.sh` documentato che legga la chiave da una variabile d'ambiente e scriva `app/capability.js` (mai committarlo), oppure iniettare il valore come `resValue`/`BuildConfig` in `build.gradle` invece che come asset.

```bash
#!/usr/bin/env bash
# scripts/build-apk.sh — uso: RABEL_APP_KEY=<64 hex> ./scripts/build-apk.sh
set -euo pipefail
[ "${#RABEL_APP_KEY}" -eq 64 ] || { echo "RABEL_APP_KEY mancante o non valida"; exit 1; }
printf 'globalThis.RABEL_APP_KEY = "%s";\n' "$RABEL_APP_KEY" > app/capability.js
gradle -p android assembleRelease
rm -f app/capability.js
```

#### B3. `admin.html` + `manifest.json`: PWA che installa un pannello morto
`admin.html`, `manifest.json:5` (`"start_url": "admin.html"`)

`admin.html` è la versione precedente del pannello: stesso CSS (i 6.499 caratteri di `<style>` sono **identici byte per byte** a `app/index.html`) e stesso markup, ma parla con una Web App Google Apps Script via JSONP (`script.google.com/.../exec`, token in `localStorage`). Quel backend non esiste più nel progetto: le funzioni `call('saveDish')`, `call('ping')` non hanno interlocutore.

Inoltre `manifest.json` **non è linkato da nessuna pagina attiva**: `index.html` non ha `<link rel="manifest">`, quindi il menù pubblico non è installabile, mentre chi installasse la PWA da `/manifest.json` otterrebbe il vecchio pannello rotto.

**Correzione**: eliminare `admin.html` (o spostarlo in `legacy/`), riscrivere `manifest.json` con `"start_url": "./"` e collegarlo da `index.html` (vedi §4.3).

---

### P1 — Funzionali

#### B4. Se la tabella `rabel_hours` è vuota il pannello diventa inutilizzabile
`app/ui.js:14-22`

```js
state = { ..., hours: domain.expandHours(hours), ... }
```
`expandHours` lancia `Orari incompleti` se una delle 7 giornate non è coperta. Su un progetto Supabase nuovo (o dopo un errore di import) `load()` fallisce **prima** di `renderAll()`: banner d'errore, nessun pannello, e nessun modo di inserire gli orari dall'interfaccia (l'editor è renderizzato solo da `renderHours()`). Si esce solo con SQL.

**Correzione**
```js
const fallback = domain.DAYS.map((days, i) => ({ days, slots: hours.length ? null : [] }));
let parsed;
try { parsed = domain.expandHours(hours); }
catch (_) { parsed = domain.DAYS.map(days => ({ days, slots: [] })); }
```

#### B5. Svuotare un campo dal pannello non lo svuota sul sito
`index.html:1220`

```js
$$('[data-i18n]').forEach(el => { const v = STR[l][el.dataset.i18n]; if (v) el.textContent = v; });
```
`if (v)` salta le stringhe vuote. Se l'operatore cancella *Sottotitolo* o *Numero recensioni* (`applySheetInfo` imposta `STR.it.tagline = ''`), il DOM mantiene il testo dello snapshot: il sito continua a mostrare il vecchio valore. Il test `tests/info-render.test.js` verifica solo `STR`, non il DOM, quindi non lo intercetta.

**Correzione**: `if (v !== undefined) el.textContent = v ?? '';`

#### B6. Il pulsante «Vedi il menù →» dell'app Android è morto
`app/index.html:105`, `MainActivity.java:41-52`

```html
<a class="site" href="/" target="_blank" rel="noopener">Vedi il menù →</a>
```
Nella WebView l'origine è `https://appassets.androidplatform.net`, quindi `/` non esiste: `shouldInterceptRequest` risponde 404 e `shouldOverrideUrlLoading` blocca tutto ciò che non è quell'host. Inoltre `target="_blank"` non ha alcun `onCreateWindow` configurato.

**Correzione**: URL assoluto del sito pubblico e apertura nel browser di sistema:
```java
// in shouldOverrideUrlLoading
if (uri.getHost() != null && !HOST.equals(uri.getHost())) {
    startActivity(new Intent(Intent.ACTION_VIEW, uri));
    return true;
}
```

#### B7. Android 15: contenuto sotto status bar e barra di navigazione
`android/app/build.gradle:5` (`targetSdk 35`), `styles.xml`

Con `targetSdk 35` Android 15 applica l'edge-to-edge forzato: l'header `position: sticky` finisce sotto la status bar e il toast/le azioni sotto la barra di navigazione. Il tema imposta ancora `android:statusBarColor`, deprecato.

**Correzione** (una delle due): padding CSS con `env(safe-area-inset-*)` **e** `<meta name="viewport" content="...,viewport-fit=cover">`, oppure opt-out temporaneo nel tema:
```xml
<item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
```

#### B8. Rotazione dello schermo durante lo scatto: la foto si perde
`MainActivity.java:60-95`, `AndroidManifest.xml:4`

L'Activity non dichiara `configChanges`, quindi ruotando il telefono mentre è aperta la fotocamera viene ricreata: `uploadCallback` diventa `null`, `onActivityResult` esce subito e la foto è scartata senza messaggi (il file temporaneo in MediaStore resta orfano).

**Correzione**: `android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize"` sull'activity, oppure salvataggio dello stato dell'upload in `onSaveInstanceState`.

#### B9. `blocked()` costruisce una `WebResourceResponse` con body `null`
`MainActivity.java:52`

```java
new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, null)
```
Passare `null` come `InputStream` è rischioso: alcune versioni di WebView/Chromium sollevano `NullPointerException` quando leggono la risposta (basta una richiesta a `/favicon.ico` per attivare il ramo). **Usare un flusso vuoto**:
```java
new java.io.ByteArrayInputStream(new byte[0])
```

#### B10. Un menù vuoto su Supabase svuota il sito
`supabase-live.js:35-36`

```js
// Tabelle ancora vuote: manteniamo lo snapshot, non mostriamo un menu vuoto.
if (menu.status === 'fulfilled' && (menu.value.length || categories.status === 'fulfilled'))
```
Il commento dice «manteniamo lo snapshot», il codice fa l'opposto: se `rabel_dishes` è vuota ma `rabel_categories` risponde, `applySheetMenu([], categories)` azzera il menù e il sito mostra «nessun risultato». Un errore di importazione (o un `delete` accidentale) pubblica un sito vuoto invece di lasciare l'ultimo menù buono.

**Correzione**: richiedere almeno un piatto, oppure introdurre un flag esplicito (`rabel_info.menu_empty = 'ok'`).

#### B11. Edge Function: service-role senza limiti né rete di sicurezza
`supabase/functions/rabel-app/index.ts`

- nessun rate limit / quota: con la chiave (pubblica, vedi B1) si possono fare richieste illimitate;
- `DELETE` è consentito su tutte le 4 tabelle, senza filtri obbligatori: `?id=gte.0` cancella tutto il menù in una richiesta;
- nessun audit log;
- nessun backup automatico documentato.

Azioni consigliate: ruotare la chiave (B1), richiedere un filtro su `DELETE`/`PATCH`, valutare orari di sola lettura per l'anon, pianificare un backup giornaliero (`supabase db dump` o PITR).

---

### P2 — Minori, robustezza, prestazioni

| # | Dove | Problema | Correzione |
|---|---|---|---|
| B12 | `app/ui.js:13` | `busy()` riabilita **tutti** i `.btn`: le frecce ↑/↓ che dovrebbero restare disabilitate (prima/ultima categoria) tornano cliccabili | salvare lo stato `disabled` precedente, o usare una classe `.is-busy` |
| B13 | `app/client.js:26-35` | l'upload non cancella la foto precedente → bucket che cresce, foto orfane | dopo il PATCH riuscito, `DELETE` del vecchio percorso (come da `PHOTO-WORKFLOW.md`) |
| B14 | `app/ui.js:72` | solo `image/jpeg|png|webp`: da iPhone un HEIC può arrivare con `type` non previsto e viene rifiutato con un messaggio poco chiaro | convertire comunque via canvas quando il tipo inizia per `image/`, o messaggio esplicito |
| B15 | `app/ui.js:28` | `price('1.234')` → `1.23`; `'8,999'` rifiutato (messaggio generico) | normalizzare separatori migliaia e mostrare il valore interpretato |
| B16 | `app/ui.js:49` | aggiunta categoria duplicata: l'utente vede l'errore grezzo di Postgres (`duplicate key value violates unique constraint`) | intercettare il codice `23505` e mostrare «Categoria già esistente» |
| B17 | `app/client.js:10` | `fetch` senza timeout: con rete assente l'app resta «occupata» a lungo | `AbortSignal.timeout(15000)` |
| B18 | `scripts/verify_public_apk.py` | a ogni push esegue una **scrittura reale** in produzione; fallisce se il menù è vuoto o la chiave è stata ruotata | spostarlo su `workflow_dispatch` e usare un progetto di staging |
| B19 | `index.html` | 1,6 MB in un solo file: 18 blob base64 (1,12 MB di payload), **6 duplicati (364 KB sprecati)**, 9 file di font | estrarre font/immagini in file con hash + `<link rel="preload">`; almeno rimuovere i duplicati |
| B20 | `index.html` | nessun `manifest`, `theme-color`, `apple-touch-icon` o JSON-LD (`Restaurant`): niente installazione da home screen, SEO locale debole | vedi §4.3 |
| B21 | `.github/workflows/` | nessun job esegue i test JS; `node --test tests/` (con la barra) fallisce su Node 22, `node --test` funziona | aggiungere `npm test` / job CI |
| B22 | `android/app/build.gradle` | nessun `signingConfig` di release: `assembleRelease` produce un APK **non firmato**; nessuna icona (`android:icon`) né `versionCode` incrementale | keystore di release in secret, `buildTypes.release`, icona adattiva |
| B23 | `app/index.html:5` | `viewport` senza `viewport-fit=cover` e CSS senza `safe-area-inset-*`: su iPhone (PWA o WebView) header sotto la notch e toast sotto la home bar | vedi §4.6 |
| B24 | `.gitignore` | mancano `*.apk`, `*.aab`, `android/.gradle/`, `.idea/`; la voce `deliverables/` non corrisponde a nulla | pulizia |

---

## 2. File inutili o da sistemare

| File | Dimensione | Usato da | Verdetto |
|---|---|---|---|
| `admin.html` | 40 KB | nessuno | **Eliminare** (o `legacy/`). Duplica il 100% del CSS di `app/index.html` e parla con un backend Apps Script scomparso |
| `manifest.json` | 0,8 KB | nessuno | **Riscrivere** (§4.3) o eliminare: `start_url` punta al pannello legacy |
| `foto/*.jpg` (4 file) | 501 KB | nessuno | **Eliminare**: le stesse immagini sono già (a) in base64 dentro `index.html` e (b) nel bucket `rabel-photos/import-20261119/` |
| `downloads/Rabel-Gestione.apk` + `README.md` | 28 KB | link di download | **Rimuovere dal repo pubblico** (contiene la chiave) e distribuire via release privata |
| `icons/icon-180.png`, `192`, `512` | 28 KB | solo `admin.html`/`manifest.json` | **Tenere**: servono per la PWA/iPhone, ma oggi sono orfani |
| `import/rabel-sheet.json` | 44 KB | solo `scripts/export_sheet.py` in scrittura | **Tenere solo se** serve per un re-import; nessun codice lo legge |
| `scripts/export_sheet.py` | 4 KB | nessuno | conversione una-tantum: richiede `openpyxl` e un `.xlsx` che non è nel repo. Archiviare o documentare |
| `README.md` | 9 byte (`# Rabbel`) | GitHub | **Da scrivere**: non spiega cos'è, come si avvia, come si pubblica, come si testa |
| `.gitignore` → `deliverables/` | – | – | Voce morta, innocua |
| `app/capability.js` | – | build | Non è inutile: è **mancante** (B2) |
| CSS `#view-login`, `.brand-hero` in `app/index.html` | ~0,6 KB | nessuno | residuo della copia da `admin.html`, si può rimuovere |

**Duplicazioni interne a `index.html`**: 18 blob base64 ma solo 12 distinti → 4 font duplicati e 2 JPEG duplicati (≈364 KB di payload inutile).

---

## 3. Test e CI

```
$ node --test
# tests 11  # pass 11  # fail 0
```

- I test coprono: client (chiave, errori), dominio orari, rendering info (XSS `strong`), foto live, categorie live.
- **Non** coprono: il caso «tabella orari vuota» (B4), il DOM dopo `setLang` con stringa vuota (B5), il comportamento con menù vuoto (B10).
- La CI compila l'APK con una chiave di zeri e verifica l'APK pubblicato contro la **produzione**, ma non esegue i test JS.

---

## 4. Come installare l'app su iPhone

### 4.1 Perché l'APK non è utilizzabile
iOS non esegue APK: un'app iOS è un bundle `.ipa` firmato con un certificato Apple e un *provisioning profile* che elenca i dispositivi autorizzati (o che è approvato dall'App Store). Non esiste alcun convertitore APK→IPA: **va ricostruita** come progetto iOS. La buona notizia è che qui il "motore" è una WebView, quindi la logica (`app/*.js`, `app/index.html`) è già portabile al 100%.

### 4.2 Le tre strade possibili

| Strada | Cosa ottieni | Costo | Tempo | Adatta a |
|---|---|---|---|---|
| **A. PWA** (Safari → «Aggiungi a Home») | Icona sul telefono, schermo intero, stessi file in `app/` | 0 € (solo hosting HTTPS) | ore | gestione quotidiana dal telefono, uso interno |
| **B. App nativa Capacitor + TestFlight/App Store** | `.ipa` vero, aggiornamenti, icona App Store | 99 €/anno + Mac o CI cloud | 1-3 giorni | distribuzione "ufficiale", più telefoni |
| **C. Sideload** (AltStore/Sideloadly, Apple ID gratuito) | `.ipa` installato a mano | 0 € | ore | solo prove: **scade dopo 7 giorni** |

Consiglio pratico: **A subito** (risolve il "serve su iPhone" oggi), **B quando l'app è stabile** e serve un'installazione permanente senza account Apple sul telefono.

### 4.3 Strada A — PWA (consigliata come primo passo)

Da fare **prima** nel codice, perché oggi il pannello non è pubblicabile: contiene la chiave tecnica in `capability.js`, quindi chi apre il sito la legge.

1. **Sostituire la chiave embedded con il login Supabase Auth.** L'infrastruttura c'è già: tabella `rabel_owners`, funzione `rabel_is_owner()`, policy di scrittura per `authenticated`, grant su tabelle e bucket. Serve solo:
   - abilitare in Supabase *Authentication → Providers → Email* (magic link o password);
   - creare l'utente del proprietario e inserire il suo `user_id` in `rabel_owners`;
   - nel pannello usare `@supabase/supabase-js` con la chiave **publishable** (quella già in `supabase-live.js`, che è pubblica per definizione) e `signInWithOtp`/`signInWithPassword`;
   - togliere la dipendenza dalla Edge Function per le scritture (le RLS bastano) e rimuovere `capability.js` dal flusso.
   
   Questo chiude anche B1, B2 e B11 in un colpo solo.

2. **Aggiungere il manifest e i meta iOS** in `app/index.html`:
   ```html
   <link rel="manifest" href="manifest.webmanifest">
   <link rel="apple-touch-icon" href="../icons/icon-180.png">
   <meta name="theme-color" content="#191512">
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
   ```
   ```json
   {
     "name": "Rabel — Gestione Menù",
     "short_name": "Rabel",
     "start_url": "./index.html",
     "scope": "./",
     "display": "standalone",
     "background_color": "#191512",
     "theme_color": "#191512",
     "icons": [
       { "src": "../icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "../icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
     ]
   }
   ```
   (i percorsi vanno sistemati in base a dove pubblichi `app/`; l'ideale è servire il pannello su una sottocartella, es. `https://menù.example/admin/`, con gli asset relativi).

3. **Servire in HTTPS** (obbligatorio: senza HTTPS non funzionano né `crypto.randomUUID()` usato per i nomi delle foto, né il service worker). GitHub Pages, Netlify o Cloudflare Pages vanno bene. Attenzione al `Content-Security-Policy` già presente in `app/index.html`: va aggiunto il dominio Supabase Auth se cambi libreria.

4. **Aggiungere safe-area** (B23):
   ```css
   header { padding-top: calc(10px + env(safe-area-inset-top)); }
   body   { padding-bottom: calc(80px + env(safe-area-inset-bottom)); }
   ```

5. **Sul telefono**: aprire il link in **Safari** (non Chrome, che su iOS non installa PWA) → *Condividi* → *Aggiungi a Home*. L'icona usa `apple-touch-icon` (180×180).

6. *Opzionale*: un service worker minimo per l'uso in caso di rete debole. Non serve per l'installazione su iOS, solo per l'offline.

Limite da conoscere: la PWA su iOS non può andare su App Store, non ha accesso a tutte le API native e le notifiche push richiedono iOS 16.4+. Per un pannello di gestione va benissimo.

### 4.4 Strada B — `.ipa` con Capacitor (quando serve un'app "vera")

Prerequisiti: **Apple Developer Program (99 $/anno)** e un Mac con Xcode (Capacitor 7: Xcode 16+, iOS 14+; Capacitor 8: Xcode 26+, iOS 15+) **oppure** una CI macOS (GitHub Actions `macos-latest`, Codemagic, Bitrise).

```bash
# nella root del progetto
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Rabel Gestione" it.rabel.gestione --web-dir=app
npx cap add ios           # crea ios/App/App.xcworkspace
npx cap copy ios          # copia app/ dentro il bundle iOS
npx cap open ios          # apre Xcode
```

Adattamenti specifici di questo progetto:

1. **Host**: su Android gli asset sono serviti da `appassets.androidplatform.net`; su iOS Capacitor li serve da `capacitor://localhost`. I percorsi relativi (`domain.js`, `client.js`, `ui.js`) funzionano, ma il codice che costruisce URL assoluti va verificato.
2. **Rete**: l'endpoint Supabase è HTTPS e la Edge Function risponde con `Access-Control-Allow-Origin: *`, quindi il `fetch` da `capacitor://localhost` è permesso. Se passi a Supabase Auth, aggiungi l'origine alle *Redirect URLs*.
3. **Chiave**: **non** reinserire `capability.js` nell'IPA: un `.ipa` è un archivio ZIP, la chiave si estrae in 2 secondi. Usa Supabase Auth.
4. **Fotocamera / galleria**: `<input type="file" capture>` funziona in WKWebView, ma servono in `Info.plist`:
   ```xml
   <key>NSCameraUsageDescription</key><string>Per fotografare i piatti del menù.</string>
   <key>NSPhotoLibraryUsageDescription</key><string>Per scegliere le foto dei piatti.</string>
   ```
5. **Icona**: `AppIcon` 1024×1024 PNG senza canale alpha.
6. **Firma**: in Xcode → *Signing & Capabilities* → team, bundle id `it.rabel.gestione`, *Automatically manage signing*.
7. **Build**: *Product → Archive* → *Distribute App* → **TestFlight** (o App Store).

Distribuzione su iPhone:

| Canale | Requisiti | Limiti |
|---|---|---|
| **TestFlight interno** | fino a 100 membri del team App Store Connect | build valide **90 giorni** |
| **TestFlight esterno** | link pubblico | 10.000 tester, Beta App Review sulla prima build |
| **Ad Hoc** | UDID dei dispositivi registrati | 100 iPhone/anno, profilo valido 1 anno |
| **App Store** | revisione Apple | possibile rifiuto per la *guideline 4.2* ("minimum functionality") se l'app è solo una WebView; mitigare con funzioni native reali (fotocamera, notifiche, offline) o usare distribuzione **unlisted** / Custom Apps |

Alternativa senza Mac: gli stessi comandi girano su un runner macOS in CI, con certificato `.p12`, provisioning profile e App Store Connect API key nei secret; `xcodebuild -exportArchive` produce l'`.ipa`, poi `xcrun altool`/`notarytool` o `fastlane pilot` lo caricano su TestFlight.

### 4.5 Strada C — solo per prove

Con un Apple ID gratuito e un PC (AltStore, Sideloadly, Xcode) si installa un `.ipa` firmato "in locale", ma la firma **scade dopo 7 giorni**, massimo 3 app per dispositivo e 10 App ID a settimana. Non è una soluzione per un locale.

### 4.6 Checklist iOS prima del rilascio

- [ ] Login Supabase Auth al posto della chiave embedded (obbligatorio)
- [ ] `viewport-fit=cover` + `env(safe-area-inset-*)` per notch e home bar
- [ ] Gestione HEIC (foto da iPhone)
- [ ] `apple-touch-icon` 180×180 e icona App Store 1024×1024
- [ ] `theme-color`, manifest corretto, `start_url` relativo
- [ ] Test su Safari reale: fotocamera, upload, orari, tastiera che copre i campi
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) se pubblichi su App Store
- [ ] Ruotare la chiave della Edge Function e ritirare l'APK pubblico (B1)

---

## 5. Riassunto delle priorità

1. **Oggi**: ruotare `RABEL_APP_TOKEN_HASH`, rimuovere l'APK dal repo pubblico (B1).
2. **Questa settimana**: sistemare B4 (orari vuoti bloccano il pannello), B5 (campi non cancellabili), B6 (link morto), B9 (crash potenziale), B24 (`.gitignore`), README.
3. **Prima di dare l'app ai dipendenti**: Supabase Auth + PWA su iPhone (B1/B2/B11/B20/B23).
4. **Poi**: pulizia file morti (§2), snellimento `index.html` (B19), firma release Android (B22), CI con i test (B21).

---

## 6. Domande prima di procedere con le modifiche

1. Applico le correzioni? Posso partire da P0+P1 (B1-B11) oppure solo dalla pulizia non distruttiva.
2. Per iPhone: PWA (veloce, 0 €) o `.ipa` Capacitor (99 €/anno, App Store/TestFlight)?
3. Hai un account **Apple Developer Program** e un Mac (o possiamo usare una CI macOS)?
4. La chiave condivisa può essere sostituita dal login Supabase Auth, o c'è un vincolo a mantenere l'accesso "senza password"?
---

## 7. I due modelli di accesso a confronto

Questa sezione risponde alla domanda: *perché sostituire la chiave condivisa con Supabase Auth, e cosa cambia davvero nella pratica?*

### 7.1 Come funziona oggi (chiave condivisa)

```
APK  ──►  app/capability.js   (globalThis.RABEL_APP_KEY = "<64 hex>")
            │
            ▼
     x-rabel-app-key: <chiave>
            │
            ▼
Edge Function rabel-app
  SHA-256(chiave) == RABEL_APP_TOKEN_HASH ?  →  service_role
            │
            ▼
  PostgREST / Storage (4 tabelle + bucket foto, RLS bypassata)
```

- **Nessuna identità**: il server non sa *chi* sta scrivendo. Tutti gli utilizzatori sono indistinguibili.
- **Il segreto viaggia con l'app**: essendo dentro l'APK, chiunque lo possieda lo estrae (`unzip` + 1 riga). Il file `tests/app-client.test.js` stesso documenta il formato della chiave.
- **Revoca tutto-o-niente**: per togliere l'accesso a un telefono smarrito bisogna ruotare `RABEL_APP_TOKEN_HASH`, il che spegne **tutti** i dispositivi e obbliga a ricostruire e reinstallare l'APK su ognuno.
- **Superficie**: la Edge Function gira con la *service role*, quindi scavalca le RLS. Tutto ciò che è raggiungibile da lì (4 tabelle + upload foto) è raggiungibile anche da chi ha la chiave, senza limiti di frequenza.
- **Conseguenza sul repo**: ogni volta che l'APK esce dal canale privato, la chiave è compromessa. Oggi è persino committato in una repository pubblica.
- **Conseguenza su iPhone**: la chiave non può stare in una pagina web pubblica → la strada PWA è chiusa finché resta questo modello.
- **Vantaggio reale**: aprire l'app e lavorare, zero attriti, nessuna email, nessun reset password. In un locale, con personale che cambia, è un vantaggio concreto da non buttare via.

### 7.2 Come funziona con Supabase Auth

```
Telefono ──► login (email + password, oppure magic link)
              │
              ▼
     JWT dell'utente + chiave "publishable" (pubblica per definizione)
              │
              ▼
     PostgREST / Storage  ──►  RLS: auth.uid() ∈ rabel_owners ?
```

- **Identità per persona o per dispositivo**: ogni sessione è revocabile singolarmente.
- **Il segreto sparisce dall'app**: la chiave publishable è fatta per essere pubblica; il JWT è dell'utente e scade.
- **Revoca chirurgica**: si elimina la riga da `rabel_owners` (o si chiudono le sessioni dal pannello Supabase) e quella persona perde l'accesso subito, senza ricostruire nulla.
- **La Edge Function diventa superflua**: le migrazioni concedono già `insert/update/delete` a `authenticated` e le policy `owner write ...` usano `rabel_is_owner()`. Anche le RPC `rabel_replace_hours`, `rabel_reorder_categories`, `rabel_move_and_delete_category` sono già `grant execute ... to authenticated` e controllano il proprietario. Si possono eliminare ~70 righe di server, un secret (la service role) e un passaggio di build.
- **Costo**: un login iniziale per dispositivo (poi la sessione resta salvata), e la gestione delle credenziali.

### 7.3 Confronto sintetico

| | Chiave condivisa (oggi) | Supabase Auth |
|---|---|---|
| Attrito per l'utente | nullo | un login la prima volta per dispositivo |
| Chi può entrare | chiunque abbia l'APK | solo gli utenti autorizzati |
| Revoca di un singolo telefono | no (solo revoca globale) | sì |
| Segreto dentro l'app | sì (estraribile) | no |
| Service-role usata dal client | sì (via proxy) | no |
| RLS | aggirate | applicate |
| Codice server necessario | Edge Function (70 righe) | nessuno |
| PWA su iPhone | impossibile in sicurezza | possibile |
| App Store | possibile ma con segreto a bordo | possibile |
| Attribuzione delle modifiche | nessuna | per utente |
| Costo | 0 € | 0 € (il piano Supabase gratuito include Auth) |
| Lavoro di migrazione | — | ~2-4 ore, nessuna modifica al DB |

### 7.4 Via di mezzo: un unico account condiviso

Se il vincolo vero è «in cucina nessuno vuole digitare password ogni volta», la soluzione più pragmatica è **un solo account Supabase Auth per il locale** (es. `gestione@paninotecarabel.it`), configurato una volta per dispositivo e salvato nel portachiavi del telefono:

- si mantiene l'esperienza «apro e lavoro» dopo il primo accesso;
- il segreto non è più nell'APK né nel sito;
- cambiare la password equivale a una revoca globale, ma senza ricostruire l'app;
- si perde solo l'attribuzione per persona (che oggi comunque non esiste).

Con password (non magic link) non serve nemmeno la posta configurata. Il magic link è più comodo ma il servizio email integrato di Supabase ha limiti bassi: per un uso quotidiano conviene la password oppure un SMTP proprio.

### 7.5 Cosa cambierebbe concretamente nella repo

| File | Modifica |
|---|---|
| `app/client.js` | da wrapper `fetch` con header `x-rabel-app-key` a wrapper che allega il JWT (o `@supabase/supabase-js`) |
| `app/index.html` | riusare la schermata di login già presente in `admin.html` (stesso CSS, `#view-login`) |
| `app/capability.js` | eliminato; sparisce anche lo step di injection nella CI |
| `.gitignore` | rimane pulito, nessun segreto da proteggere |
| `supabase/functions/rabel-app/` | si può dismettere (o lasciare spento ruotando il token) |
| `tests/app-client.test.js` | da riscrivere sul nuovo client |
| DB / migrazioni | **nessuna modifica**: `rabel_owners`, `rabel_is_owner()`, grant e policy sono già pronti |

### 7.6 Nota su iPhone, viste le risposte

Senza **Apple Developer Program** e senza **Mac** oggi non è possibile produrre un `.ipa` installabile:

- un `.ipa` va compilato con Xcode o su una CI macOS, e firmato con un certificato Apple;
- la firma "gratuita" (AltStore/Sideloadly) scade dopo 7 giorni e richiede comunque un `.ipa` già compilato;
- l'App Store/TestFlight richiede l'account a 99 $/anno.

Quindi, allo stato attuale, **l'unica strada realistica per iPhone è la PWA** — che però richiede il passaggio a Supabase Auth, perché altrimenti la chiave finirebbe in chiaro in una pagina web. In altre parole: la scelta sull'autenticazione è il prerequisito della soluzione iPhone, non un'alternativa.
---

## 8. Login + PWA: come funzionerebbe in pratica

### 8.1 Cosa vede l'utente

**Prima volta, su iPhone**
1. Apre il link del gestionale in Safari (es. `https://sietecreator.github.io/Rabbel/admin/`).
2. Vede una schermata di accesso: email + password (un solo account per il locale, oppure uno per persona).
3. Entra nel pannello identico a quello dell'APK.
4. *Condividi → Aggiungi a Home*: compare l'icona «Rabel».

**Uso quotidiano**
5. Tocca l'icona: si apre a schermo intero, senza barra di Safari.
6. La sessione è già attiva: nessun login. Se il token è scaduto (dopo 1 h) il rinnovo avviene in automatico e invisibile.
7. Modifica piatti/orari/foto come oggi; il sito pubblico si aggiorna entro 30 secondi (è già così oggi).

**Casi limite**
- *Telefono smarrito*: dal pannello Supabase si revoca la sessione di quel dispositivo (o si cambia la password), senza toccare gli altri.
- *Fine turno*: pulsante «Esci» nell'header (opzionale).
- *Sessione scaduta/archivio iOS svuotato*: il pannello mostra di nuovo il login; la password è nel portachiavi, due tocchi.

### 8.2 Sotto il cofano

```
┌─ Telefono ────────────────────────────────────────────────┐
│  app/index.html + ui.js                                  │
│      │                                                   │
│      ├─ login  → POST /auth/v1/token?grant_type=password │
│      │            apikey: sb_publishable_…               │
│      │            { email, password }                    │
│      │         ← { access_token (JWT, 1h), refresh_token }│
│      │            salvati in localStorage                │
│      │                                                   │
│      └─ ogni chiamata → Authorization: Bearer <JWT>      │
└───────────────────────────┬──────────────────────────────┘
                            ▼
                  PostgREST / Storage / RPC
                            │
                            ▼
              RLS: auth.uid() ∈ rabel_owners ?
```

Tre cose importanti:

1. **La chiave `sb_publishable_…` non è un segreto.** È già pubblica oggi dentro `supabase-live.js`: identifica il progetto, non autorizza nulla. L'autorizzazione la fa il JWT dell'utente insieme alle RLS.
2. **La Edge Function non serve più.** Le migrazioni concedono già `insert/update/delete` al ruolo `authenticated` e le policy `owner write …` usano `rabel_is_owner()`. Anche le RPC (`rabel_replace_hours`, `rabel_reorder_categories`, `rabel_move_and_delete_category`) sono già `grant execute … to authenticated` e controllano il proprietario. Spariscono quindi: la chiave a 64 caratteri, `app/capability.js`, lo step di injection nella CI, il secret `RABEL_APP_TOKEN_HASH` e le 70 righe della funzione.
3. **Il token dura 1 ora** e viene rinnovato con il `refresh_token` (rotante). Il rinnovo va fatto una volta sola anche se parte da più richieste in parallelo: nel codice sotto c'è una singola promise condivisa.

### 8.3 Il nuovo `app/client.js`

Stessa superficie pubblica di oggi (`table`, `mutate`, `rpc`, `upload`, `photoUrl`) più `login`, `logout`, `session`: **`app/ui.js` cambia solo nell'avvio e nel login**. Nessuna libreria, nessun build step, e la CSP attuale (`connect-src https://mpspdmjvjkqsssxgbxkm.supabase.co`) è già corretta.

```js
/* Accesso con Supabase Auth. La chiave "publishable" è pubblica:
   i permessi sono applicati dalle RLS in base all'utente loggato. */
(function (root) {
  'use strict';
  const BASE = 'https://mpspdmjvjkqsssxgbxkm.supabase.co';
  const KEY = 'sb_publishable_DQmp56xX11ChgWZRMgA7Ng_c31EPH4w';
  const STORE = 'rabel-session';

  const read = () => { try { return JSON.parse(localStorage.getItem(STORE)); } catch (_) { return null; } };
  const save = s => s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE);

  async function auth(path, body) {
    const response = await fetch(BASE + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const msg = data && (data.error_description || data.msg || data.error);
      throw new Error(msg === 'Invalid login credentials' ? 'Email o password non validi' : (msg || 'Accesso non riuscito'));
    }
    return data;
  }
  async function login(email, password) {
    const session = await auth('token?grant_type=password', { email, password });
    save(session);
    return session;
  }
  async function logout() {
    const session = read();
    save(null);
    if (session) fetch(BASE + '/auth/v1/logout', {
      method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token }
    }).catch(() => {});
  }

  let pending = null;
  async function accessToken() {
    const session = read();
    if (!session) throw new Error('Accedi per continuare');
    if (session.expires_at && session.expires_at - 120 > Date.now() / 1000) return session.access_token;
    pending ||= auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(next => { save(next); return next.access_token; })
      .catch(() => { save(null); throw new Error('Sessione scaduta: accedi di nuovo'); })
      .finally(() => { pending = null; });
    return pending;
  }

  async function request(path, options = {}) {
    const token = await accessToken();
    const response = await fetch(BASE + '/' + path, {
      ...options,
      headers: { apikey: KEY, Authorization: 'Bearer ' + token, ...options.headers },
      cache: 'no-store'
    });
    const text = await response.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) throw new Error((data && (data.message || data.error)) || 'Errore di rete (' + response.status + ')');
    return data;
  }

  function table(name, query = {}) { return request('rest/v1/' + name + '?' + new URLSearchParams(query)); }
  async function mutate(name, method, data, query = {}, upsert = false) {
    const result = await request('rest/v1/' + name + '?' + new URLSearchParams(query), {
      method, headers: { 'Content-Type': 'application/json', Prefer: (upsert ? 'resolution=merge-duplicates,' : '') + 'return=representation' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    if (!Array.isArray(result) || result.length === 0) throw new Error('Nessuna modifica effettuata: ricarica i dati');
    return result;
  }
  function rpc(name, data) { return request('rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
  function photoUrl(path) { return path ? BASE + '/storage/v1/object/public/rabel-photos/' + path.split('/').map(encodeURIComponent).join('/') : ''; }
  async function upload(file, dishId) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Usa un’immagine JPEG, PNG o WebP');
    if (file.size > 5 * 1024 * 1024) throw new Error('La foto supera 5 MB');
    const ext = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[file.type];
    const path = 'dishes/' + dishId + '/' + crypto.randomUUID() + '.' + ext;
    await request('storage/v1/object/rabel-photos/' + path, { method: 'POST', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
    await mutate('rabel_dishes', 'PATCH', { photo_path: path }, { id: 'eq.' + dishId });
    return path;
  }

  root.RabelClient = { login, logout, session: read, table, mutate, rpc, upload, photoUrl };
})(globalThis);
```

### 8.4 Il login nell'interfaccia (`app/index.html` + `app/ui.js`)

Il CSS esiste già (`#view-login`, `.brand-hero`, `.card`, `.btn`, riga 47 di `app/index.html`): manca solo il markup, da mettere prima di `<div id="view-app">`.

```html
<div id="view-login" hidden>
  <div class="brand-hero">
    <div class="big">PANINOTECA <em>RABEL</em></div>
    <p>Gestione menù</p>
  </div>
  <div class="card">
    <label for="l-email">Email</label>
    <input type="email" id="l-email" autocomplete="username" inputmode="email">
    <label for="l-password">Password</label>
    <input type="password" id="l-password" autocomplete="current-password">
    <div class="actions"><button class="btn" id="btn-login">Accedi</button></div>
    <p class="muted" id="login-status"></p>
  </div>
</div>
```

In `app/ui.js`, l'avvio attuale (riga 86):

```js
busy(async()=>{await load(); $('#connDot').textContent='● connesso'; ...});
```

diventa:

```js
function showLogin(message) {
  $('#view-login').hidden = false;
  $('#view-app').hidden = true;
  $('#login-status').textContent = message || '';
  $('#connDot').textContent = '● non connesso';
  $('#connDot').classList.add('off');
}
async function enterApp() {
  $('#view-login').hidden = true;
  $('#view-app').hidden = false;
  await load();
  $('#connDot').textContent = '● connesso';
  $('#connDot').classList.remove('off');
}
$('#btn-login').onclick = () => busy(async () => {
  await api.login($('#l-email').value.trim(), $('#l-password').value);
  $('#l-password').value = '';
  await enterApp();
});
$('#l-password').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-login').click(); });
$('#btn-logout').onclick = () => { api.logout(); location.reload(); };
if (api.session()) enterApp().catch(e => showLogin(e.message));
else showLogin();
```

E, in `busy()`, una riga per riportare al login quando la sessione non è più valida:

```js
catch (e) { if (/Accedi|Sessione scaduta/.test(e.message)) showLogin(e.message); else banner(e.message); }
```

### 8.5 Configurazione Supabase (una volta sola, ~15 minuti)

1. **Authentication → Providers → Email**: attivo. Disattivare «Confirm email» (o creare l'utente già confermato) e, se non serve, disattivare le registrazioni pubbliche.
2. **Authentication → Users → Add user**: `gestione@paninotecarabel.it` + password robusta. Copiare lo **UUID**.
3. Nel SQL editor:
   ```sql
   insert into public.rabel_owners (user_id)
   values ('00000000-0000-0000-0000-000000000000')  -- UUID dell'utente
   on conflict do nothing;
   ```
4. Verifica: con la password dell'utente, `POST /auth/v1/token?grant_type=password` deve restituire un `access_token`; lo stesso token deve poter fare `PATCH /rest/v1/rabel_dishes?id=eq.1`.

Nessuna migrazione, nessuna nuova tabella, nessuna policy da scrivere.

### 8.6 Cosa sparisce (e perché conviene)

| Oggi | Dopo |
|---|---|
| `app/capability.js` + injection nella CI | eliminati |
| Secret `RABEL_APP_TOKEN_HASH` | eliminato |
| Edge Function `rabel-app` (70 righe, service-role) | dismessa |
| APK con segreto estraibile | APK senza segreti |
| Revoca = ricostruire e reinstallare | revoca = un clic |
| PWA impossibile | PWA possibile |

L'APK Android continua a funzionare con lo **stesso codice**: la WebView carica da `https://appassets.androidplatform.net` (contesto sicuro, quindi `localStorage`, `fetch` e `crypto.randomUUID` funzionano) e la CSP consente già le chiamate al progetto Supabase. Si può anche togliere `capability.js` dalla whitelist in `MainActivity.java:47`.

### 8.7 La PWA in concreto

**Cosa serve**, in ordine di importanza:

1. **HTTPS** (obbligatorio). GitHub Pages, Cloudflare Pages o Netlify vanno bene.
2. **`manifest.webmanifest`** valido, con `start_url` e `scope` relativi alla cartella del pannello.
3. **`apple-touch-icon` 180×180** e `apple-mobile-web-app-title` (il resto dei meta c'è già, righe 9-11).
4. **`viewport-fit=cover`** + `env(safe-area-inset-*)` nel CSS.
5. *Opzionale*: un service worker per l'offline (su iOS **non** serve per installare).

```json
{
  "name": "Rabel — Gestione Menù",
  "short_name": "Rabel Gestione",
  "description": "Pannello di gestione del menù della Paninoteca Rabel",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#191512",
  "theme_color": "#191512",
  "lang": "it",
  "icons": [
    { "src": "../icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "../icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "../icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Struttura di pubblicazione** (una sola origine, così `/` resta il menù pubblico e il link dell'header funziona anche sul web):

```
/                      index.html + supabase-live.js      → menù pubblico
/admin/                index.html, domain.js, client.js, ui.js, sw.js, manifest.webmanifest
/icons/                icon-180.png, icon-192.png, icon-512.png
```

**Service worker minimo** (solo se si vuole che il pannello si apra anche senza rete):

```js
const CACHE = 'rabel-admin-v1';                       // ← incrementare a ogni deploy
const SHELL = ['./', './index.html', './domain.js', './client.js', './ui.js', './manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;        // Supabase va sempre in rete
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match('./index.html'))));
});
```

Senza service worker il pannello funziona ugualmente: semplicemente, senza rete, Safari mostra la sua pagina di errore invece dell'interfaccia con il banner «Errore di connessione».

**Deploy** con GitHub Pages (la repo è già su GitHub), senza build step:

```yaml
name: Deploy gestionale
on:
  push:
    branches: [main]
    paths: ['index.html','supabase-live.js','app/**','icons/**','.github/workflows/deploy.yml']
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deploy.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - run: |
          mkdir -p _site/admin
          cp index.html supabase-live.js _site/
          cp -r icons _site/
          cp app/index.html app/domain.js app/client.js app/ui.js _site/admin/
          [ -f app/sw.js ] && cp app/sw.js _site/admin/ || true
          [ -f app/manifest.webmanifest ] && cp app/manifest.webmanifest _site/admin/ || true
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }
      - id: deploy
        uses: actions/deploy-pages@v4
```

### 8.8 Installazione su iPhone, passo-passo

1. Aprire `https://<dominio>/admin/` in **Safari** (non Chrome: su iOS solo Safari installa le PWA).
2. Fare login. iOS propone di salvare la password nel portachiavi: accettare.
3. Toccare **Condividi** (quadrato con freccia) → **Aggiungi a Home**.
4. Confermare il nome («Rabel Gestione» da `apple-mobile-web-app-title`).
5. Aprire dall'icona: si avvia a schermo intero, senza barra degli indirizzi, con la sessione già attiva.
6. Per aggiornare l'app non si fa nulla: al riavvio carica la versione nuova (con service worker, cambiare il nome della cache).

### 8.9 Limiti da conoscere

| Limite | Impatto | Mitigazione |
|---|---|---|
| iOS non mostra un prompt di installazione | l'utente deve usare «Aggiungi a Home» | istruzioni con 3 screenshot |
| Dopo ~7 giorni senza aprire il sito, iOS può svuotare i dati | login da rifare | raro per un uso quotidiano; password nel portachiavi |
| Niente notifiche push (tranne iOS 16.4+ con PWA installata) | non previste oggi | — |
| Nessun aggiornamento in background | — | il pannello carica i dati a ogni apertura |
| Cache del service worker | possibili file vecchi dopo un deploy | incrementare `CACHE` a ogni rilascio |
| Il pannello è raggiungibile pubblicamente | serve davvero il login | password robusta + RLS (già così) |
| Account condiviso: chi ha il telefono può modificare | nessuna attribuzione | blocco del telefono; in futuro un account per persona |

### 8.10 Piano di lavoro stimato

| Attività | Tempo |
|---|---|
| Nuovo `client.js` + login UI + logout + gestione sessione scaduta | 2-3 h |
| Configurazione Supabase (utente + `rabel_owners`) | 15 min |
| Rimozione `capability.js`, injection CI, dismissione Edge Function | 30 min |
| Manifest, icone, safe-area, service worker | 1 h |
| Workflow di deploy GitHub Pages | 30 min |
| Test su iPhone reale (login, foto, orari, tastiera) | 1 h |
| Aggiornamento test (`tests/app-client.test.js`) | 1 h |
| **Totale** | **~1 giornata** |

Nessuna modifica al database, nessuna migrazione, nessun costo (il piano Supabase gratuito include Auth).
