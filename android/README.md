# Rabel Gestione — Android

L'interfaccia è in `app/`, incorporata nell'APK e caricata da un'origine HTTPS
locale della WebView. Il backend è Supabase; l'APK non contiene chiavi service
role né la password del proprietario. Le immagini sono caricate nello Storage
pubblico con percorsi unici. La sessione viene conservata nella memoria privata
dell'app; il backup Android è disattivato. Serve una connessione Internet.

## Prima configurazione del proprietario

L'account non è creato automaticamente. Per evitare che altri possano prenderne
possesso, le registrazioni pubbliche sono disabilitate. Nel progetto Supabase
`Rabel Menu`, un amministratore deve creare manualmente in Authentication →
Users l'utente con email interna `proprietario@rabel.invalid`, impostare una
password robusta direttamente nella dashboard e segnare l'email come confermata.
L'indirizzo è un identificatore tecnico, non una casella di posta; il recupero
è manuale dalla dashboard. Non comunicare la password in chat.

Una volta creato l'utente, aggiungerne l'ID a `public.rabel_owners` tramite un
amministratore Supabase. La sola creazione dell'account **non** abilita la
scrittura. L'app accetta solo la password e controlla l'autorizzazione tramite
`rabel_is_owner()`. Le policy RLS rimangono la protezione effettiva dei dati.

## Build e limiti della prova

Con JDK 17, Gradle 8.10.2 e Android SDK 35: `gradle -p android assembleDebug`.
Le build debug sono solo per test: la chiave debug dei runner è temporanea e
un APK futuro firmato con una chiave diversa non potrà aggiornare quello
installato. Prima di una distribuzione definitiva creare e conservare in modo
sicuro una chiave di firma release stabile, eseguire test end-to-end autenticati
sul dispositivo e verificare fotografia, selezione file, sessione, rete e sito.
Non pubblicare l'APK su Google Play.
