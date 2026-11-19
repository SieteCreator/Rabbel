# Rabel — Menù e gestionale

Sito del menù della **Paninoteca Rabel** (Via San Tommaso 4B, Torino) e pannello di
gestione riservato al proprietario, con backend Supabase.

## Struttura

| Percorso | Cosa è |
|---|---|
| `index.html` | Menù pubblico: snapshot statico + aggiornamento live da Supabase ogni 30 s |
| `supabase-live.js` | Lettura anonima delle tabelle del menù (RLS in sola lettura) |
| `app/` | Gestionale: piatti, categorie, foto, orari, info e social |
| `android/` | Contenitore Android (WebView) del gestionale |
| `supabase/migrations/` | Schema, policy RLS, funzioni RPC |
| `downloads/` | APK pronto da installare |
| `tests/` | Test (`node --test`) |
| `docs/revisione-tecnica.md` | Analisi tecnica, bug noti e roadmap |

## Accesso al gestionale

Il pannello `app/` richiede un login **Supabase Auth** (email + password). Non
contiene più alcuna chiave condivisa: i permessi sono applicati dalle policy RLS
in base all'utente, che deve trovarsi nella tabella `public.rabel_owners`.

Per aggiungere o revocare una persona:

```sql
-- abilitare
insert into public.rabel_owners (user_id) values ('<uuid utente>');
-- revocare
delete from public.rabel_owners where user_id = '<uuid utente>';
```

L'utente si crea da *Supabase → Authentication → Users* (oppure via Admin API).
La sessione resta attiva sul dispositivo e si rinnova da sola; il pulsante
**Esci** la chiude.

## Sviluppo

Non c'è build step per il web: sono file statici.

```bash
# test
node --test

# APK (richiede JDK 17, Gradle 8.10.2, Android SDK 35)
gradle -p android assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

L'APK viene compilato anche dalla CI (`.github/workflows/android-build.yml`) a
ogni modifica di `app/` o `android/`, e caricato come artifact.

## Pubblicazione

Il gestionale può essere servito come sito statico su HTTPS (GitHub Pages,
Netlify, Cloudflare Pages) e installato su iPhone con *Safari → Condividi →
Aggiungi a Home*, oltre che come APK su Android. Il menù pubblico è `index.html`
alla radice.
