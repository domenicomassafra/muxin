# Plancia #47 — anteprime grafiche della proposta

Le immagini `chat47-desktop-design-fixture.png`,
`chat47-mobile-design-fixture.png` e `chat47-orca-design-fixture.png`
sono screenshot ottenuti con il browser Chrome dedicato sul Mac Studio
(CDP, viewport desktop 1365 × 950 e mobile 390 × 950).

**Sono anteprime di design con dati interamente sintetici**, etichettate in
immagine come tali. Visualizzano composizione, gerarchie, colori e capacità
per la revisione dell'owner; non sono screenshot del bundle eseguito sul
MiniPC, non certificano il contenuto delle API o invio/streaming attivi.
Il prototipo React che le immagini illustrano vive nella
[PR #49](https://github.com/domenicomassafra/plancia/pull/49).

Il flusso funzionale è verificabile separatamente dai test e dagli adapter
same-origin. La cattura del bundle React autentico potrà essere allegata
quando il Mac Studio completerà il build ammesso dalla guardia risorse
e quando l'owner sceglierà il design.

## Readback live sul MiniPC, 23 ottobre 2026

In una **nuova scheda** del Chrome dedicato sullo Studio, autenticata alla
Plancia MiniPC, sono state effettuate tre richieste same-origin con cookie owner
(POST con header CSRF), registrando solo status e conteggi:

| Route | Stato HTTP | Prova osservata |
| --- | --- | --- |
| `GET /api/v1/hermes/profiles` | 200 | `source=hermes-native`, 10 profili consentiti dall'API |
| `GET /api/v1/agents/terminals` | 200 | `donor=orca`, zero terminali connessi elencati |
| `POST /api/v1/agents/search` query `git`, host `minipc` | 200 | 8 risultati restituiti, di cui **5** con `agent=pi` |

Questi valori sono conteggi dei record presenti nelle **risposte di quelle
tre chiamate**, non il numero totale di sessioni né una prova dell'invio live.
I dati dei messaggi, token di sessione e ID non sono stati salvati.
