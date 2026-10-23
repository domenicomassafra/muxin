# Editing Obsidian tramite writer canonico (#13)

La UI vive in Plancia. Backend e ricevute sono in ControlCenter; vault, policy,
CAS e preimage appartengono al servizio Obsidian MCP di dodo-services. Nessun
vault, token o secondo writer nel browser. Installazione e prova della release
composta sono registrate nella #20.

## Lettura e permessi

`GET /api/workspace/obsidian/note?path=...` legge al massimo 256 KiB di Markdown
UTF-8 e restituisce `{path, content, sha256, editable, reason, modified, size}`.
SHA-256 identifica i byte originali interi. Il reader usa `O_NOFOLLOW` per le
directory e rifiuta traversal, symlink, path esclusi e contenuti non testuali.

L'editing richiede `CONTROLCENTER_OBSIDIAN_EDITING=1` sul server e il writer MCP
canonico aggiornato. La UI consente sostituzioni di note esistenti in `04-areas`
e `05-knowledge`. README, indici, hub, file nascosti e conflitti Syncthing non
sono editabili da questa superficie; seguono il proprio writer specifico.
La allowlist di lettura rimane più ampia di quella di scrittura.

## Preview e conferma

`POST /api/workspace/obsidian/operations/note.edit/preview` riceve
`{path, content, expected_sha256, idempotency_key}`. Verifica sessione owner,
Origin, CSRF, limiti, path e preimage; produce un diff bounded senza mutazioni.
Il packet contiene identità, SHA prima/dopo e scadenza a dieci minuti. Il backend
conserva il testo nella sola memoria del processo, per un massimo di cento packet.
Una chiave riutilizzata con contenuti diversi è rifiutata.

La UI invalida la preview se cambia il testo o la nota e ne verifica path e SHA.
Conserva le bozze in memoria al cambio nota, senza storage persistente del browser.

`POST .../apply` riceve soltanto `{packet_id, confirmation:"CONFERMA"}`.
Il backend rilegge la preimage e riserva atomicamente una receipt SQLite prima
di invocare `vault_write` sul MCP loopback esistente. Risolve la credenziale con
il consumer `secret` installato e costruisce il preflight sul server: il browser
non propone capability o policy attendibili.

Il writer usa il lock LifeOS e il CAS nativo già presente in
`chatgpt_promoter.native_cas_replace`: verifica i byte spostati dallo scambio,
conserva quelli concorrenti e mantiene il journal di recupero fuori dal vault.
Sorgenti donor e schema pubblico dei venti tool restano invariati.

## Readback, errori e replay

Il backend rilegge la stessa path e confronta la postimage con lo SHA del packet
e quello del writer. Solo allora termina la receipt con `succeeded`. Audit mostra
identificatori e outcome, senza corpi delle note, diff o preimage.

Una ripetizione dello stesso packet riuscito restituisce la receipt persistente
senza una seconda scrittura. Una receipt in corso, fallita o interrotta richiede
verifica esplicita; non viene rilanciata automaticamente. Dopo restart i packet
in memoria decadono, mentre le receipt restano durevoli.

`401` indica sessione assente; `403` nega Origin/CSRF/policy; `409` segnala versione
obsoleta, conflitto, packet scaduto o esito da verificare; `422` rifiuta input non
valido; `503` segnala un writer non verificabile. La UI conserva il draft e
consuma la conferma al primo invio. Non riprova una scrittura incerta.

Il lock è locale all'host e non serializza tutti i peer Syncthing. Il CAS nativo
e il journal proteggono la pubblicazione; un conflitto esterno richiede
riconciliazione, mai un overwrite forzato.
