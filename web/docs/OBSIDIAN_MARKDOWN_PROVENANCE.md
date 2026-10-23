# Parser Markdown della vista Obsidian (#13)

La vista usa parser già pubblicati, caricati come dipendenze npm e senza patch upstream. Sono distinti dal donor server SilverBullet MIT scelto in [#1](https://github.com/domenicomassafra/plancia/pull/24), che rimane una superficie read-only separata dietro il proxy canonico. Le sole parti locali sono l'adapter dell'indice limitato a 180 note, la risoluzione degli URL verso path autorizzati e la visualizzazione del frontmatter testuale.

| Dipendenza npm | Versione testata | SHA `gitHead` del pacchetto su npm (23/10/2026) | Licenza / fonte |
| --- | --- | --- | --- |
| `react-markdown` | `10.1.0` | `44d2e4a44b37461ab7778d6870c1a9eb36393ad2` | MIT, [remarkjs/react-markdown](https://github.com/remarkjs/react-markdown) |
| `remark-gfm` | `4.0.1` | `109972e8a773bf5dac1d6d2da0776557f36971aa` | MIT, [remarkjs/remark-gfm](https://github.com/remarkjs/remark-gfm) |
| `remark-wiki-link` | `2.0.1` | `1e541070b0a2967c7f7b1a6947168a59979ab391` | MIT, [landakram/remark-wiki-link](https://github.com/landakram/remark-wiki-link) |

La configurazione `skipHtml` impedisce tag HTML grezzi; non vengono usati `rehype-raw`, `dangerouslySetInnerHTML` o rendering di immagini remote. Gli URL esterni sono limitati a `https://`, `http://`, `mailto:` come navigazione volontaria, i wikilink Obsidian si risolvono solo contro l'indice e l'allowlist esposti dall'API; i match ambigui sono testo non navigabile. I test SSR verificano HTML/script ostili, immagini di tracking, URL `javascript:`, codice fenced, frontmatter e collegamenti consentiti.

La fonte originale della UI e la relazione col backend privato restano descritte in [`web/PROVENANCE.md`](../PROVENANCE.md); la presente nota documenta soltanto i parser nuovi della feature #13.

Controllo del lockfile: le uniche licenze MPL-2.0 dichiarate sono `lightningcss` e i suoi binari opzionali, **già presenti** nel lock prima di #13 come strumenti di build Tailwind/Vite. Le nuove librerie Markdown e le dipendenze che aggiungono dichiarano licenze permissive (MIT/ISC/BSD). Nessun file del donor MPL è stato modificato.
