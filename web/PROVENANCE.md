# Provenance della UI importata

- **Origine tracciata:** repository privato `domenicomassafra/controlcenter`, path `dashboard/web/` (Signal Deck React/Vite).
- **Snapshot sorgente esatto:** `26f5f3346ab5a8e8d30d8a8b8b946e65a35637f1` nel checkout MiniPC pulito al 23 ottobre 2026; ultimo commit che tocca la directory nella sua storia raggiungibile: `1d7b610fa1043518e3b2396b6851bcf91bd16500`, 22/10/2026 14:41:59 Europe/Rome. Storia parent ancora rintracciabile in ControlCenter con `git log -- dashboard/web/`.
- **Destinazione:** repository pubblico `domenicomassafra/plancia`, cartella `web/`, branch PR #27 da `b006f998b6e72a69ce2090d6a835006296d05bad`.
- **Metodo:** `rsync` read-only della directory frontend pulita sul MiniPC, esclusi `node_modules/`, `dist/`, `tsconfig.tsbuildinfo`, `.DS_Store`, quattro PNG privati `public/assets/devices/`. Alla fonte `git ls-files dashboard/web | wc -l` restituisce 49 file; i 45 file di prodotto/test rimanenti sono stati copiati. Il nome di pacchetto in `package.json` e `package-lock.json` passa a `plancia-web`; due indirizzi e-mail in fixture test (9 occorrenze) vengono sostituiti coerentemente con due identificatori `personN@example.test`. Nessuna sorgente backend è importata.

Per confrontare una copia *privata* autorizzata sulla stessa macchina, impostare le variabili `CONTROL_CENTER_CHECKOUT` e `PLANCIA_CHECKOUT` ai rispettivi checkout locali (senza pubblicarne i path):

```bash
cd "$CONTROL_CENTER_CHECKOUT"
git status --short -- dashboard/web
git show 26f5f334:dashboard/web/src/lib/api.ts | shasum -a 256
cd "$PLANCIA_CHECKOUT"
git diff --stat
git diff --check
```

La storia ControlCenter resta nel repo sorgente; il commit d'importazione Plancia registra path, commit e trasformazioni. **Non si rivendica una storia Git fisicamente riscritta via `git subtree` in Plancia**: quel trasferimento non è stato eseguito. Se il requisito di `git log -- web/` con gli originali SHA fosse indispensabile, preparare un import selettivo con review prima di farlo. La fonte corrente della release attiva MiniPC e la futura fonte UI saranno unificate da #20 soltanto con permesso specifico per il delta esterno e verifica del consumer; nessun file backend né sorgente privata deve essere pubblicato per adempiere alla provenance.

La licenza Apache-2.0 presente in `LICENSE`/`NOTICE` appartiene al donor Muxin. Non attribuirla automaticamente a tutti i file provenienti da ControlCenter; l'owner deve mantenere l'attribuzione appropriata al codice proprio durante l'integrazione e chiarire nel rilascio pubblico eventuali vincoli di licenza dei singoli componenti. Nessun donor di terzi è stato importato dalla directory sorgente.

**Dimensione dei sorgenti ereditati:** `web/src/views/ProfilesView.tsx` è 58.906 byte e `web/src/views/WorkspaceView.tsx` è 33.303 byte, importati come sorgenti preesistenti senza modifiche. Sono oltre il limite per nuovi file scritti da agenti: #6/#12 dovranno estrarre componenti locali piccoli prima di ampliarli; l’import #27 ne preserva il contenuto per il confronto provenienza. `package-lock.json` è generato dal package manager.
