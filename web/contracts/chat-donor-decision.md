# Plancia #47 — ricerca donor 2 e contratto del prototipo

Ricerca del 23 ottobre 2026, GitHub REST (`repos/{owner}/{repo}`,
`commits/main`, `contents/...`) e lettura del sorgente ai commit indicati.
Le stelle sono gli `stargazers_count` del repository intero rilevati in questa
ricerca, non un indice della qualità del codice né delle installazioni attive.
La ricerca antecedente più ampia è
[plancia#16](https://github.com/domenicomassafra/plancia/issues/16#issuecomment-6362715837).

| Donor | Stelle (GitHub, 23/10) | Revisione verificata / licenza | Codice effettivamente letto e valore per l'embed |
| --- | ---: | --- | --- |
| [mannaandpoem/OpenManus](https://github.com/mannaandpoem/OpenManus) | 716 | README di reindirizzamento / nessuna licenza dichiarata nell'API | Repository spostato: **contiene solo README**, nessuna UI da forkare |
| [FoundationAgents/OpenManus](https://github.com/FoundationAgents/OpenManus) | 58.765 | `3309bf4e416f` · MIT | `app/agent/{manus,toolcall}.py`: runtime Python, tool/MCP, browser-use. Non contiene una chat React PWA pronta da incorporare |
| [T3 Code](https://github.com/pingdotgg/t3code) | 29.569 | `eb1510d2493c` · MIT | `apps/web/src/components/{ChatView,chat/ChatCanvas,chat/ChatComposer}.tsx`: riferimento per thread list, transcript, composer e tool; dipende da contratti/server e stato del prodotto T3 |
| [Orca](https://github.com/stablyai/orca) | 103.379 | `41402a58118d` · MIT | `mobile/src/session/{MobileNativeChatView,MobileNativeChatToolRun,MobileNativeChatComposer,MobileNativeChatLiveLine}.tsx` e `src/shared/native-chat-types.ts`: eventi/tool, streaming, input lease, dedup delle fonti transcript/hook/scrape; componenti React Native e runtime Orca, non un widget React DOM isolato |
| [Paseo](https://github.com/getpaseo/paseo) | 21.773 | `fed19f3d29cb` · Apache-2.0 su LICENSE | `packages/app/src/agent-stream/chat-outline/rail.web.tsx`: pattern della navigazione temporale su React Native/Unistyles; daemon/storage aggiuntivi. Verificare licenze tag storici: Paseo era AGPL-3.0 prima della transizione |
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot) | 5.476 | `700189e0c590` · Apache-2.0 | Driver chat/ACP e orchestratore proprietario di bot/VM: adatto a ispirare card e permessi, ma lo stack completo duplicherebbe il runtime Signori |
| [Pi Durable](https://github.com/earendil-works/pi) | 117.369 | `36be9c612e64` · MIT | `packages/durable/README.md`: checkpoint/resume di **nuove** conversazioni con proprio storage; API dichiarata *experimental*, non importer delle sessioni Pi originali |

Nessun modulo terzo è stato copiato nel prototipo. Non abbiamo importato codice
LGPL/MPL/GPL/AGPL. Il riferimento visuale principale è **T3 Code**, con l'UI
strutturata Orca come riferimento per stato di invio e tool. La shell,
le sessioni e l'autorizzazione rimangono quelle già installate in Plancia e
ControlCenter, senza aggiungere un daemon T3/Orca/Paseo né un archivio conversazioni.

## Architettura della chat embedded

```text
web/src/views/AgentsSection.tsx
  ├─ Signori Hermes → AgentsSignoriView → agents-remoting.ts
  │   └─ GET /api/v1/hermes/profiles, /sessions, /messages
  │        └─ Hermes CLI nativa (--redact), session_id e profilo invariati
  ├─ Pi · Orca → OrcaChatPanel → orca-chat.ts → lib/api.ts
  │   ├─ GET /api/v1/agents/terminals + /screen (poll 2,5 s)
  │   ├─ POST /api/v1/agents/search (estratti dell'indice Orca)
  │   └─ POST /api/v1/agents/terminals/{handle}/send (solo writable)
  └─ Desktop → adapter Guacamole #17
```

Tutti i browser request sono **same-origin** con cookie owner/CSRF già governati
da `lib/api.ts`. L'API verifica autorizzazioni/identità prima di leggere o
scrivere. L'adapter client valida sorgente/handle, impone limiti e non ritenta un
invio dall'esito incerto. Nessun token, session JSONL, stream di tool privato,
DB aggiuntivo, profilo nuovo o storage di conversazioni nel browser.

**Prova nel perimetro disponibile:** Hermes esporta i messaggi nativi redatti
via API già presente; Orca possiede un indice di sessioni Pi e può leggere lo
schermo di un PTY Orca *già attivo*. L'aggiornamento della schermata ogni 2,5 s
è un live refresh, **non token streaming strutturato**. La ricerca Orca attuale
espone solo 8 estratti per query, non un intero transcript Pi. Il server non
espone ancora attach/send Hermes; il composer è quindi disabilitato e gli
allegati sono dichiarati non disponibili. Sono limiti visibili nel prototipo.

## Trasporto nativo da completare, senza seconda persistenza

Il backend ControlCenter dovrebbe attestare per ogni sessione
`source`, `profile_id`, `session_id`, `capabilities` e grant di lettura,
attach, send, stream e upload **separati**. Lo stream futuro necessita di
`event_id` monotono, `session_id` originale, `turn_id`, sequenza,
`type` discriminante (`message.delta`, `message.final`, `tool.started`,
`tool.updated`, `tool.finished`, `attachment`, `approval`, `error`)
e una modalità `resume_from` con deduplicazione all'ultimo evento.
Il writer nativo resta Hermes/Orca/Pi: il browser applica solo le proiezioni,
senza produrre una seconda fonte di verità. Per inviare, il server deve
verificare identity originaria, lease, policy, idempotenza e stessa sessione
prima/dopo; errori ambigui richiedono readback, mai retry implicito.

La UI completa (timeline tool, preview allegati, input reale a Signori) si
prosegue **solo quando questi eventi e grant sono disponibili**. La preferenza
colori proprietario resta bianco/nero/grigi. Il design finale richiede
revisione dell'owner prima del cutover #20.
