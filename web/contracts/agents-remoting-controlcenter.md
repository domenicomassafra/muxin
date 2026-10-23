# Contratti Plancia #16/#17 → ControlCenter (delta esterno NON applicato)

Questo documento è una proposta revisionabile di interfaccia per il backend **privato**
`domenicomassafra/controlcenter/dashboard/`. Le viste Plancia consumano soltanto API
same-origin con cookie owner; non ospitano il runtime Hermes, guacd, file di credenziali,
database o stato delle sessioni. Il consumer installato resta ControlCenter fino al cutover
separato #20. Queste route Hermes non sono attualmente accertate in produzione.

## #16 — inventario e sessioni Hermes nativi

Superficie da aggiungere, una volta approvata la patch backend dal proprietario:

1. `GET /api/v1/hermes/profiles`: inventario da `hermes profile list` **solo quando
   formato/versione sono verificati** più manifest Signori canonico (allowlist), max 24.
2. `GET /api/v1/hermes/profiles/{profile_id}/sessions?limit=20`: sessioni esistenti
   della CLI `hermes --profile <id> sessions list --limit 20`; verificare identificatore
   e appartenenza al profilo; no lettura di DB/JSONL privati fuori API ufficiale.
3. `GET /api/v1/hermes/profiles/{profile_id}/sessions/{session_id}/messages`:
   `hermes --profile <id> sessions export --session-id <sid> --format jsonl --redact -`;
   leggere record già redatti, max 50 messaggi e 8 KiB di testo ciascuno.

Esempio di **forma tipizzata** (valori illustrativi, mai un dato runtime):

```json
{
  "source": "hermes-native",
  "profiles": [{
    "id": "example-profile", "name": "Profilo di prova", "host": "minipc",
    "gateway": "unknown", "version": null,
    "capabilities": { "readable": false, "attachable": false, "sendable": false }
  }]
}
```

Le altre due risposte sono rispettivamente
`{ "source":"hermes-native", "profile_id":"example-profile", "sessions": [{ "id":"existing_1", "title":null, "updated_at":null }] }`
e `{ "source":"hermes-native", "profile_id":"example-profile", "session_id":"existing_1", "redacted":true, "messages":[{ "role":"assistant", "text":"contenuto già redatto", "timestamp":null }] }`.
Gli ID ammessi dal client sono 1–128 caratteri alfanumerici/underscore/trattino;
il backend deve verificarli **nuovamente** e usare argv espliciti senza shell.
Il client rifiuta `source` diverso, mismatch profilo/sessione, `redacted` diverso da
`true`, duplicati, campi strutturali invalidi e payload oltre 256 KiB. L'API deve limitare
stdout/tempo CLI, filtrare i segreti prima del JSON e non inserire ID/messaggi in log.

Autorizzazione per **ogni** route: middleware esistente owner/Tailnet/Origin,
sessione HTTP e policy per profilo; 401 anonimo/scaduto, 403 non abilitato,
404 adapter assente/profilo non ammissibile, 503 CLI non operativa. Nessun nuovo
endpoint di **resume/invio** è autorizzato: `attachable` e `sendable` restano
`false` finché trasporto Hermes supportato, identità originaria, policy,
idempotenza e stessa sessione prima/dopo siano verificati. La vista non presenta
azioni mutative anche se un server immaturo restituisse flag true. La presenza
di `hermes` nell'indice Orca **non** sostituisce la fonte `hermes-native`.

Il delta backend deve includere test adapter `0` e più profili, allowlist,
sessione cross-profile rifiutata, JSONL malformato, output oltre bound, timeout,
payload redatto, 401/403 e check di nessun secondo runtime. Eseguire dopo review
anche `dashboard/tests/test_agent_bridge.py` e `test_agents_api.py`; osservare
versione reale della CLI e output tipizzato prima della promozione.

## #17 — inventory Guacamole e capability verificate

Il WIP Studio **esterno e non distribuito** ControlCenter `c23a633b` contiene
`dashboard/backend/{desktops.py,desktop_guacd.py}` e la UI Guacamole 1.6.0;
va preservato, confrontato col WIP MiniPC dirty e reviewato dal suo proprietario.
La route WIP `GET /api/v1/desktops` ritorna soltanto
`{ "donor":"apache-guacamole-1.6.0", "desktops":[{"id":"test","name":"Esempio","protocol":"vnc"}] }`.
Senza stato salute/capability il client Plancia classifica ogni target
`unconfigured` e tutti i permessi `false`.

**Delta minimo sul backend ControlCenter**, prima di abilitare interazione:

```json
{
  "donor": "apache-guacamole-1.6.0",
  "status": "ready",
  "desktops": [{
    "id": "test", "name": "Desktop isolato", "protocol": "vnc",
    "state": "ready",
    "capabilities": { "view": true, "input": false, "clipboard": false }
  }]
}
```

Il backend può segnalare `status` `ready`, `offline`, `permission_denied` o
`unconfigured`; il singolo target può avere `state` analogo. `ready` è ammesso
solo dopo verifica reale del proxy guacd su loopback e grant owner per quello
specifico ID. `view`, `input`, `clipboard` sono grant **indipendenti**, derivati
dalla policy server e non dalle capacità teoriche del protocollo. Uno stato
missing/ignoto/grant missing fa fallire chiuso il client. L'input richiede
`view`; un target non allowlisted va negato prima del dial. Mai host/porta,
password o token nel payload.

Il WebSocket esistente WIP `WS /api/v1/desktops/{id}/tunnel` necessita guard
owner-session/Tailscale/Origin già presente, allowlist server, bounded frame,
limite/rate di input, chiusura esplicita, separazione per capability delle
istruzioni clipboard/mouse/tastiera e health del proxy. Guacd **non autentica**;
tenere porta privata su loopback. La UI viewer ufficiale
`@pelotech/guacamole-common-js@1.6.0` (Apache-2.0) va portata soltanto nella
fase autorizzata, serializzando le modifiche a package/lock con #20.
Nessuna dipendenza Guacamole o sorgente WIP è stata copiata in questa PR.

Test backend necessari: 401 anonimo, 403 Origin/grant non valido, ID non
allowlisted senza tentativo di socket, CSRF/cookie nell'upgrade, frame e
clipboard limitati, servizio guacd assente/offline, disconnessione, prove
Guacamole su desktop Xvfb/VNC isolato. Poi prove fisiche autorizzate Mac/Linux,
con Windows separato #25. Lo stato `ready` **non certifica** screenshot/input
reali finché i test con nonce e readback non siano documentati nel ticket.

## Separazione dei file / consegna

Plancia: `web/src/lib/agents-remoting.ts`, `web/src/views/{AgentsSignoriView,RemoteDesktopView}.tsx`
e `web/tests/agents-remoting-contract.test.ts`. Integrazione nav unica in
`App.tsx` appartiene a #6. Le API condivise `web/src/lib/api.ts`, tipi globali,
`package*.json` e cutover appartengono a #20. Il legacy `/agents` serve la
cronologia Orca con auth dalla stessa origine, tramite link separato;
l'iframe non è assunto compatibile con CSP/X-Frame-Options.

Fonti donor: [Apache Guacamole 1.6.0](https://guacamole.apache.org/releases/1.6.0/),
[guacd Docker ufficiale](https://guacamole.apache.org/doc/gug/guacamole-docker.html),
[repack JS](https://github.com/pelotech/guacamole-common-js) (Apache-2.0),
WIP ControlCenter `c23a633b` e descrizione CLI Hermes in
[Plancia #16](https://github.com/domenicomassafra/plancia/issues/16).
