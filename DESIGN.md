# Plancia — architettura e confini di integrazione

## Fonte singola progettata

```text
Repository pubblico domenicomassafra/plancia
  web/ — React/Vite, shell/PWA e viste owner (fonte di prodotto dopo #20)
    src/views/        Panoramica, Flotta, Account, Workspace, Audit
    src/components/   componenti di dominio
    src/lib/api.ts    client browser same-origin, bootstrap sessione, CSRF
    src/lib/types.ts contratti dati ricevuti dal backend canonico
  src/, agent/, share-server/ — donor legacy Muxin isolato (Apache-2.0)
        |
        | HTTPS stessa origine + /api, /api/v1, /api/stream
        v
ControlCenter (repository privato, proprietario esclusivo dei writer)
  dashboard/backend/  auth/sessione, FastAPI, API, receipt, FleetProbe
  fleet/, policies, profile-atlas, workspace writer canonici
        |
        +--> Notion Actions attraverso Registry/transaction
        +--> vault Obsidian tramite writer canonico/CAS
        +--> agenti e host tramite bridge/donor autorizzati
```

**Situazione transitoria:** `ControlCenter/dashboard/web` è ancora la fonte consumata dalla release attiva; lo stesso frontend è stato importato in `plancia/web` come destinazione proposta. Evitare qualunque promessa di writer unico o deploy già migrato fino al cutover verificato #20. La riconciliazione del vecchio consumer, del packaging e dell'eventuale rimozione del vecchio percorso richiede un delta *esterno* esplicito e autorizzato in ControlCenter.

## Contratto browser/API conservato

Il client già implementato invoca `GET /api/v1/session` con credenziali `same-origin` per il bootstrap; richieste non GET includono l'header `X-CSRF-Token` dal cookie `__Host-controlcenter_csrf`, il backend mantiene l'identità owner e verifica sessione/Origin. Le chiamate restano relative alla stessa origine: `/api/fleet`, `/api/stream` (websocket), `/api/receipts`, `/api/profiles`, `/api/workspace`, `/api/workspace/notion`, `/api/workspace/obsidian`, `/api/workspace/operations/action-item.edit/*`, `/api/omniroute`. Per l'attuale pagina agenti dedicata vale `/agents` e il backend `/api/v1/agents/*`; una futura voce nella shell passa per #6/#16. Non ridefinire body, idempotency, audit, error semantics o CORS dalla UI per aggirare il server.

La configurazione Vite preesistente proxies `/api` a `127.0.0.1:8000` **solo nel dev locale**; in produzione è la release owner same-origin a servire bundle e API tramite auth. Il bundle statico da solo non è servizio, e qualsiasi viewer anonimo deve ricevere la risposta protetta prevista dal backend. Non memorizzare cookie/sessioni/API key nel client e non usare backend di test come writer paralleli.

## Layout condiviso e responsabilità

`web/` mantiene nomi e import relativi dell'app Signal Deck per un'importazione verificabile. #27 registra origine e API; #6 modifica esclusivamente shell/CSS globale e nome/branding visibili, bianco/nero/grigio; #12 e #13 possiedono rispettivamente i moduli Notion e Obsidian; #18 concorda manifest/PWA con #6; #20 possiede integrazione/deploy. Ogni nuovo donor è un pacchetto o servizio versionato separato con licenza, API e test del confine; niente patch o fusione del suo core.

## Sequenza di integrazione

1. #27: estrarre i file tracciati frontend dal commit source, escludere asset personali, verificare privacy, annotare SHA sorgente/path e differenze intenzionali; costruire e provare i test frontend in isolamento.
2. #20: integrare la PR base su `plancia/main` e rileggere SHA remoto; consegnare la base agli altri worker, senza attivare writer mutanti o cambiare la release.
3. #6/#12/#13/#18 e altri: aggiornare i file dei rispettivi domini con integrazione dei donor verificata e test. Ogni API nuova resta nel proprio backend ControlCenter solo dopo permesso specifico.
4. #20: progettare il delta *esterno* in `ControlCenter/dashboard` per leggere l'artefatto frontend buildato da Plancia (manifest fonte commit Plancia/SHA256, auth e route invarianti, preflight e rollback). Ottenere l'approvazione mirata prima di modificare consumer/packager esterni; confrontare release effettiva e origin/main, testare HTTPS/Tailscale e mobile, poi promuovere.
5. Eliminare un eventuale percorso UI obsoleto **solo dopo** l'effettiva migrazione dei consumer e del rollback; non cancellare la sorgente CC in questa issue.

**Vincolo pubblicazione:** `plancia` è pubblico, `controlcenter` privato. Ogni import va trattato come disclosure pubblica della sola UI: nessun file `.env`, binario personalizzato, screenshot dei dispositivi, percorso privato, identità account o fixture reali. La copia iniziale sostituisce due e-mail fixture con identità `example.test` ed esclude gli asset PNG dei dispositivi, mentre lascia la grafica React/SVG del prodotto.
