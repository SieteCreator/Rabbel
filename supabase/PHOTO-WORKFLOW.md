# Foto del menu

Le foto pubbliche dei piatti si trovano nel bucket `rabel-photos`; il campo
`rabel_dishes.photo_path` contiene il percorso relativo all'interno del bucket,
non un URL completo. Un valore `null` indica nessuna foto. Il sito costruisce
l'URL pubblico e ricarica i dati periodicamente. Le foto sono pubbliche; le
scritture su Storage e piatti sono riservate agli utenti autenticati elencati
in `rabel_owners` tramite RLS. L'account del proprietario va ancora configurato.

Per il gestionale:

1. Il proprietario accede con Supabase Auth (email + password); gli utenti
   autorizzati sono elencati in `rabel_owners` e le RLS applicano i permessi.
   Nessuna service-role key è inclusa nell'app.
2. Verificare formato JPEG, PNG o WebP e dimensione massima 5 MiB.
3. Caricare ogni nuova foto con un percorso **unico**, ad esempio
   `dishes/<id>/<uuid>.jpg`, evitando sovrascritture che potrebbero mantenere
   un'immagine vecchia nelle cache. Usare le API Storage, mai inserire righe
   direttamente in `storage.objects`.
4. Solo dopo il caricamento riuscito, aggiornare `photo_path` del piatto. Se
   l'aggiornamento fallisce, la foto precedente resta in uso; eliminare il nuovo
   oggetto orfano quando possibile. Dopo l'aggiornamento, eliminare la vecchia
   foto solo se nessun altro piatto la usa.
5. Per rimuovere un'immagine, impostare prima `photo_path` a `null`, poi
   eliminare l'oggetto se non è condiviso. Se l'eliminazione fallisce non
   ripristinare il riferimento e riprovare la pulizia in seguito.

Le quattro foto esistenti sono state copiate nel bucket sotto
`import-20261119/` e associate ai rispettivi piatti. Lo snapshot incorporato nel
sito resta un ripiego se Supabase non è raggiungibile; non è la fonte delle
foto quando il menù live è caricato con successo.
