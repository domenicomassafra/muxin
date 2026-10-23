import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite;
let NotionTypedInput;

before(async () => {
  vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  ({ NotionTypedInput } = await vite.ssrLoadModule("/src/components/NotionTypedInput.tsx"));
});

after(async () => {
  if (vite) await vite.close();
});

test("Notion multi_select shows existing tags and sends typed arrays for each toggle", () => {
  const changes = [];
  const column = { id: "tags", name: "Tags", type: "multi_select", options: ["Urgent", "Later"], editable: true };
  const fieldset = NotionTypedInput({ column, value: ["Urgent", "Legacy"], onChange: (value) => changes.push(value) });
  assert.equal(fieldset.type, "fieldset");

  const labels = fieldset.props.children[0];
  const inputs = Object.fromEntries(labels.map((label) => [label.props.children[1].props.children, label.props.children[0]]));
  assert.deepEqual(Object.keys(inputs), ["Urgent", "Later", "Legacy"]);
  assert.equal(inputs.Urgent.props.checked, true);
  assert.equal(inputs.Later.props.checked, false);
  assert.equal(inputs.Legacy.props.checked, true);

  inputs.Later.props.onChange({ target: { checked: true } });
  inputs.Urgent.props.onChange({ target: { checked: false } });
  assert.deepEqual(changes, [["Urgent", "Legacy", "Later"], ["Legacy"]]);
});
