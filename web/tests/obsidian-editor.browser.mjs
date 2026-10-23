import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

// Uses only the owner's dedicated automation Chrome and synthetic in-memory notes.
test("Obsidian editor preserves drafts, rejects late previews, confirms once and keeps conflicts", async () => {
  const cdp = process.env.PLANCIA_CDP;
  assert.ok(cdp, "Set PLANCIA_CDP to the dedicated automation browser endpoint");
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  const notes = new Map(["A", "B"].map((name) => [`05-knowledge/${name}.md`, `# ${name}\nBefore\n`]));
  const packets = new Map();
  let hold = false, held, conflict = false, writes = 0;
  const entry = "\0virtual:obsidian-editor-test";
  const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, plugins: [{
    name: "synthetic-editor-test",
    resolveId(id) { if (id === "virtual:obsidian-editor-test") return entry; },
    load(id) {
      if (id === entry) return `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {ObsidianEditor} from '/src/views/obsidian/ObsidianEditor.tsx';
        import '/src/index.css';
        const drafts=new Map(); function App(){const [path,setPath]=React.useState('05-knowledge/A.md');
        return React.createElement('main',{style:{padding:20,maxWidth:800,margin:'auto'}},
          ...['A','B'].map(n=>React.createElement('button',{key:n,onClick:()=>setPath('05-knowledge/'+n+'.md')},'Nota '+n)),
          React.createElement(ObsidianEditor,{key:path,path,drafts,onSaved:()=>{window.saved=(window.saved||0)+1}}))}
        createRoot(document.getElementById('root')).render(React.createElement(App));`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === "/__editor-test") {
          res.setHeader("content-type", "text/html");
          return res.end(await server.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@id/__x00__virtual:obsidian-editor-test"></script></body></html>'));
        }
        if (!req.url?.startsWith("/api/workspace/obsidian")) return next();
        const json = (data, status = 200) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(data)); };
        const url = new URL(req.url, "http://fixture");
        if (req.method === "GET") {
          const path = url.searchParams.get("path"), content = notes.get(path);
          return json({ path, content, sha256: sha(content), editable: true, reason: null });
        }
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        if (url.pathname.endsWith("/preview")) {
          const packet = { packet_id: crypto.randomUUID(), path: body.path, before_sha256: body.expected_sha256,
            after_sha256: sha(body.content), diff: `-Before\n+${body.content}`, diff_truncated: false, expires_at: Date.now() / 1000 + 600 };
          packets.set(packet.packet_id, body);
          if (hold) { held = () => json(packet); return; }
          return json(packet);
        }
        if (conflict) return json({ detail: "Nota cambiata: conserva il testo e aggiorna la lettura" }, 409);
        const packet = packets.get(body.packet_id);
        assert.equal(body.confirmation, "CONFERMA");
        writes++;
        notes.set(packet.path, packet.content);
        return json({ receipt_id: "synthetic-receipt", sha256: sha(packet.content), replayed: false });
      });
    },
  }] });
  let ws, target;
  try {
    await vite.listen();
    const url = `http://127.0.0.1:${vite.httpServer.address().port}/__editor-test`;
    target = await (await fetch(`${cdp}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    const pending = new Map(), exceptions = [];
    ws.onmessage = ({ data }) => {
      const value = JSON.parse(data);
      if (value.method === "Runtime.exceptionThrown") exceptions.push(value.params.exceptionDetails.text);
      if (pending.has(value.id)) { pending.get(value.id)(value); pending.delete(value.id); }
    };
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (value) => value.error ? reject(value.error) : resolve(value.result));
      ws.send(JSON.stringify({ id, method, params }));
    });
    const js = async (expression) => {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const wait = async (expression) => {
      for (let i = 0; i < 100; i++) { if (await js(expression)) return; await new Promise((r) => setTimeout(r, 50)); }
      assert.fail(`Browser condition did not become true: ${expression}`);
    };
    const click = async (label) => { await js(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(label)}).click()`); };
    const fill = async (selector, text, type = "HTMLInputElement") => {
      await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${type}.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    };
    await call("Runtime.enable"); await call("Page.enable");
    await call("Emulation.setDeviceMetricsOverride", { width: 375, height: 844, deviceScaleFactor: 1, mobile: true });
    await call("Page.navigate", { url });
    await wait("[...document.querySelectorAll('button')].some(e=>e.textContent==='Modifica nota'&&!e.disabled)");
    await click("Modifica nota");
    await fill("textarea", "# A\nDraft preserved\n", "HTMLTextAreaElement");
    await click("Nota B"); await wait("[...document.querySelectorAll('button')].some(e=>e.textContent==='Modifica nota'&&!e.disabled)");
    await click("Nota A"); await wait("document.querySelector('textarea')?.value.includes('Draft preserved')");
    hold = true; await click("Prepara anteprima");
    await wait("document.body.innerText.includes('Preparo anteprima')");
    await fill("textarea", "# A\nNewer draft\n", "HTMLTextAreaElement");
    for (let i = 0; !held && i < 50; i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(held); held(); hold = false;
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await js("document.body.innerText.includes('Modifiche da salvare')"), false);
    assert.equal(await js("[...document.querySelectorAll('button')].find(e=>e.textContent==='Prepara anteprima').disabled"), false);
    await click("Prepara anteprima"); await wait("document.body.innerText.includes('Modifiche da salvare')");
    assert.equal(await js("[...document.querySelectorAll('button')].find(e=>e.textContent==='Salva nel vault').disabled"), true);
    await fill("input", "CONFERMA");
    await click("Salva nel vault"); await wait("document.body.innerText.includes('Nota salvata e riletta')");
    assert.equal(writes, 1); assert.equal(notes.get("05-knowledge/A.md"), "# A\nNewer draft\n");
    await click("Modifica nota"); await fill("textarea", "# A\nKeep on conflict\n", "HTMLTextAreaElement");
    await click("Prepara anteprima"); await wait("document.body.innerText.includes('Modifiche da salvare')");
    conflict = true; await fill("input", "CONFERMA"); await click("Salva nel vault");
    await wait("document.querySelector('[role=alert]')?.textContent.includes('Nota cambiata')");
    assert.equal(await js("document.querySelector('textarea').value"), "# A\nKeep on conflict\n");
    assert.equal(writes, 1); assert.deepEqual(exceptions, []);
    assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"), true);
    if (process.env.PLANCIA_SCREENSHOT) {
      const shot = await call("Page.captureScreenshot", { format: "png" });
      await writeFile(process.env.PLANCIA_SCREENSHOT, Buffer.from(shot.data, "base64"));
    }
  } finally {
    ws?.close();
    if (target) await fetch(`${cdp}/json/close/${target.id}`);
    await vite.close();
  }
});
