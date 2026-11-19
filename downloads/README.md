# Rabel Gestione per Android

`Rabel-Gestione.apk` è l'app del gestionale per **Android 10 o successivo**.
Non contiene chiavi o password: al primo avvio chiede l'email e la password
dell'account autorizzato (Supabase Auth) e da quel momento ricorda la sessione.

**Se hai già una versione precedente installata, disinstallala prima di
installare questa**: le build di prova sono firmate con una chiave diversa e
Android non permette l'aggiornamento sopra una firma diversa.

Questa build è firmata con una chiave di debug temporanea, adatta alla
distribuzione interna ma non a Google Play. Per un rilascio durevole serve una
chiave di firma release custodita in sicurezza.

Chi ha accesso al gestionale può modificare menù, orari, info e foto. Per
revocare un dispositivo: cambiare la password dell'account o rimuovere l'utente
da `public.rabel_owners`.
