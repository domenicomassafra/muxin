# Plancia — prodotto e requisiti

Plancia è il punto di controllo unico dell'owner, **web-first** su desktop e iPhone. La base scelta il 20 ottobre 2026 è la superficie Signal Deck, con donor specializzati utilizzati tramite API/plugin/embed dove il comportamento è stato provato. L'app è distinta dal backend operativo ControlCenter. Le decisioni e l'origine sono documentate in [#22](https://github.com/domenicomassafra/plancia/issues/22), [#27](https://github.com/domenicomassafra/plancia/issues/27) e `web/PROVENANCE.md`.

## Esperienza richiesta

Una sola navigazione e identità owner, in browser responsive/PWA. Panoramica, Flotta, Agenti, Account, Workspace e Audit devono appartenere allo stesso prodotto, mantenendo il contesto tra schermate. La preferenza definitiva è **bianco, nero, grigi**, tipografia e gerarchie funzionali sobrie: stato reale, freshness e provenance prima della decorazione. Stati offline, sconosciuto, pending e stale restano distinti.

**Flotta:** cinque identità runtime (Studio, MiniPC, Air, Omarchy, Windows dual boot), diagnostica verificabile, storico 14 giorni e azioni con preview/apply, autorizzazione, receipt, idempotenza e rollback dove supportato. Un host silenzioso non si presenta automaticamente come spento.

**Agenti:** sessioni originali Claude Code, Codex, Pi, OpenCode, Hermes e CoS quando le integrazioni sono provate; client web accessibile anche da mobile, senza simulare l'attach creando harness duplicati. Muxin e Orca restano strumenti donor con confine esplicito; la presenza di una UI chat non certifica tutti gli harness.

**Workspace:** Obsidian sul vault canonico con albero comodo, ricerca, lettura Markdown ricca, wikilink e frontmatter, editing tramite writer canonico con CAS/conflitti. Notion parte dai database Actions: viste e proprietà modificabili via API/Registry esistenti, preimage/preview/apply/readback, nessun database secondario o replica vault. I limiti dei writer reali vanno resi visibili.

**Account e audit:** profili browser per host+browser+account con identificazione certa; operazioni governate e receipt durevoli. Dati personali mai nel bundle frontend.

## Stato e criteri di rilascio

L'import iniziale della UI React/Vite nel repository Plancia costituisce una **base di codice da integrare**. In questa fase il servizio operativo resta una release immutabile ControlCenter sul MiniPC. #6 realizza shell/theme e navigazione, #12/#13 le due superfici Workspace, #18 mobile/PWA, #20 integra, installa e verifica il consumer. Test di build e snapshot di sorgente non dimostrano accesso owner o parità funzionale.

Un rilascio si accetta con URL della stessa origine, auth/CSRF funzionanti, navigazione desktop/mobile provata, API senza dati duplicati, prova di una scrittura consentita con readback per ciascun dominio e rollback della release. Test fisici iPhone e Windows rimangono nella [#25](https://github.com/domenicomassafra/plancia/issues/25).
