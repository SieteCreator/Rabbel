# Rabel Gestione — Android

L'app non chiede email, password o accesso. La distribuzione privata contiene
una chiave tecnica casuale che abilita il servizio Supabase `rabel-app`: chi
possiede l'APK può estrarla e usarla anche senza l'app. Non condividere l'APK.
Se viene divulgato, revocare/ruotare `RABEL_APP_TOKEN_HASH` in Supabase e
rigenerare la distribuzione: tutte le copie precedenti smetteranno di funzionare.
Il service-role key resta solo su Supabase; la funzione Edge permette solo le
operazioni del gestionale e le normali policy non danno scrittura anonima.

L'APK include l'interfaccia `app/`, visualizzata da una WebView HTTPS locale.
Non funziona offline. La build privata inserisce `app/capability.js` senza
committarlo, crea un APK e lo cifra per il trasferimento. Non pubblicare l'APK
in chiaro o la chiave tecnica su un repository pubblico o su Google Play.

Il progetto richiede JDK 17, Gradle 8.10.2 e Android SDK 35. `assembleDebug`
produce una build di prova firmata con una chiave debug temporanea: per un
rilascio durevole e aggiornabile serve una chiave di firma release custodita
in sicurezza. L'APK va inoltre testato end-to-end su un vero dispositivo.
