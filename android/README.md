# Rabel Gestione — Android

Contenitore WebView del gestionale: carica `app/index.html` dall'APK tramite
`https://appassets.androidplatform.net` (contesto sicuro, così `localStorage`,
`fetch` e `crypto.randomUUID` funzionano come sul web). Non funziona offline.

L'app non contiene segreti: l'accesso avviene con Supabase Auth (email +
password) e i permessi sono applicati dalle RLS in base all'utente.

## Build

Richiede JDK 17, Gradle 8.10.2 e Android SDK 35:

```bash
gradle -p android assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Gli asset vengono presi direttamente da `../app` (`sourceSets.main.assets.srcDirs`),
quindi non c'è nulla da copiare a mano.

`assembleDebug` produce una build di prova firmata con una chiave debug generata
in locale o dal runner CI: build successive da macchine diverse hanno firme
diverse, quindi per aggiornare bisogna disinstallare la versione precedente. Per
un rilascio durevole serve una chiave release custodita in un secret e un
`signingConfig` in `app/build.gradle`.

## Note tecniche

- `MainActivity` intercetta le richieste e serve solo gli asset elencati in
  whitelist; tutto il resto è bloccato.
- I link esterni vengono aperti nel browser di sistema.
- La selezione file usa la fotocamera o il picker di sistema; `configChanges`
  evita di perdere la foto se il dispositivo ruota durante lo scatto.
- Su Android 15 l'edge-to-edge forzato è disattivato (`values-v35/styles.xml`)
  per non far finire l'interfaccia sotto le barre di sistema.
