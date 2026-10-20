# Muxin — fork ControlCenter

Contratto del fork `domenicomassafra/muxin`. Valgono anche `~/.dstack/contracts/shared-root/AGENTS.md` e i requisiti delle issue. Base vendor: [LumaryLabsLLC/muxin](https://github.com/LumaryLabsLLC/muxin), Apache-2.0.

## Architettura

- `src/`: applicazione Rust con UI nativa GPUI (feature `gui`), logica di host, sessioni, file, desktop, GitHub, CLI e server MCP. `muxin mcp` e la CLI `muxin ... --json` usano le capacità comuni; non introdurre una seconda API con semantica diversa.
- `agent/`: crate `muxen-agent`, componente per gli host Linux/macOS/Windows; non duplicare session manager e protocolli del vendor.
- Signal Deck sarà integrato **interamente in questo fork** attraverso ticket successivi. Una console web/PWA per iPhone, Workspace Obsidian completo sul vault canonico, Notion a partire dai database Actions, profili browser, fleet e chat visiva degli agenti sono **requisiti futuri**, non capacità già consegnate.
- Per integrazioni riusare donor open source maturi, registrando URL, revisione e licenza nella relativa issue. Isolare le differenze in adapter/plugin o moduli propri delimitati; la minima colla necessaria va motivata nel ticket. Verificare prima gli obblighi GPL/AGPL/LGPL/MPL; non importare senza valutazione.
- Fleet, policy, scheduler e servizi hanno autorità in `domenicomassafra/controlcenter` (decisione [#184](https://github.com/domenicomassafra/controlcenter-ops/issues/184)). Fonti Notion/Obsidian, vault e dati/credenziali runtime rimangono nei loro writer canonici; nessuna copia né storage parallelo. Non interrompere il Signal Deck operativo sul MiniPC prima del ticket di cutover.

## Comandi

Da root, Rust stable recente (edition 2024); su MiniPC eseguire build e test:

```sh
cargo test --workspace --locked --no-default-features
cargo build --release --locked --no-default-features
./target/release/muxin --version
./target/release/muxin mcp --print-config
./target/release/muxen-agent --version
git diff --check
```

Il profilo headless compila CLI/MCP senza librerie GPUI; per l'app usare `cargo build --release --workspace --locked` su host con dipendenze GUI e provare realmente la finestra. I comandi CLI/MCP e le forme JSON sono nel `README.md` upstream. Le installazioni o prove su host richiedono il writer nativo e la lettura del risultato effettivo.

## Consegna

- Diagnosi e test pertinenti prima del fix, diff rivisto e `git diff --check`. Sorgenti e test di donor esterni non si modificano senza autorizzazione per la specifica patch.
- Integrare su `main` mediante commit/PR revisionabile, con `git pull --rebase origin main` prima di pubblicare; niente force-push. Rileggere lo SHA remoto `git ls-remote origin refs/heads/main` e confrontarlo con `git rev-parse HEAD`.
- Verificare il consumer reale app, CLI o MCP sul target della issue, poi registrare comandi, output, SHA e limiti nell'issue e chiuderla solo a criteri soddisfatti.
- Le issue di integrazione si aprono **in questo fork** con `## Parent` riferito alla decisione #184, non nel repository delle policy.

## Non toccare

- Conservare integralmente `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, copyright e provenance del vendor Apache-2.0. Aggiornare eventuali attribuzioni di donor aggiunti senza rimuovere quelle preesistenti.
- Non versionare segreti, profili browser, vault Notion/Obsidian, database runtime o copie dello stato del MiniPC; non sostituire i writer già autorizzati.
- Nessun deploy anticipato e nessun intervento sui bridge RustDesk/RDP o sui servizi remoti durante l'integrazione di base.

## upstream

`origin` è `https://github.com/domenicomassafra/muxin.git`; `upstream` è `https://github.com/LumaryLabsLLC/muxin.git`. Prima di sincronizzare:

```sh
git fetch origin
git fetch upstream
git log --oneline --left-right main...upstream/main
git diff upstream/main -- LICENSE NOTICE THIRD_PARTY_NOTICES.md
```

Integrare gli aggiornamenti vendor su un branch di sync isolato tramite merge revisionato di `upstream/main` (oppure rebase soltanto di commit locali non pubblicati). Risolvere i conflitti conservando integrazioni locali e attribuzioni, eseguire test e prove app/CLI e fare PR verso `main`. Non riscrivere la storia pubblicata e non sovrascrivere le modifiche del fork.
