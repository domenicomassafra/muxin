import { strict as assert } from "node:assert";
import {
  filterProfileGroups,
  groupProfileInstances,
  isProfileBrowserHost,
} from "../src/lib/profile-groups.ts";

const profile = (hostId: string, hostLabel: string, overrides: Record<string, string> = {}) => ({
  hostId,
  hostLabel,
  browser: "chrome",
  email: "person1@example.test",
  label: "Same",
  alias: "",
  category: "",
  directory: "Profile 2",
  profile_key: "chrome:person1@example.test:Profile 2",
  identity_key: "chrome:person1@example.test",
  ...overrides,
});

const grouped = groupProfileInstances([
  profile("matebook", "MateBook", { label: "Domenico", alias: "Principale", category: "[PERSONALE]" }),
  profile("mac-studio", "Mac Studio", { label: "Domenico (person1@example.test)" }),
  profile("minipc", "MiniPC", { label: "person1@example.test" }),
]);
assert.equal(grouped.length, 1, "the screenshot's duplicate fleet identity becomes one row");
assert.equal(grouped[0].instances.length, 3);
assert.deepEqual(grouped[0].instances.map((instance) => instance.hostId), [
  "mac-studio",
  "matebook",
  "minipc",
]);
assert.equal(grouped[0].isFleetIdentity, true);
assert.equal(grouped[0].key, "identity:chrome:person1@example.test");

const computerAndCategoryFiltered = filterProfileGroups(grouped, {
  browsers: [],
  providers: [],
  hosts: ["matebook"],
  categories: ["[PERSONALE]"],
  query: "",
});
assert.equal(computerAndCategoryFiltered.length, 1, "grouped identities retain matching computer/category filters");
assert.equal(
  filterProfileGroups(grouped, {
    browsers: [], providers: [], hosts: ["minipc"], categories: ["[PERSONALE]"], query: "",
  }).length,
  0,
  "filters must intersect on the same host-local installation, not across a group",
);

const ambiguous = groupProfileInstances([
  profile("matebook", "MateBook", { directory: "Profile 2" }),
  profile("matebook", "MateBook", { directory: "Profile 3", profile_key: "chrome:person1@example.test:Profile 3" }),
]);
assert.equal(ambiguous.length, 1, "duplicate local directories for one browser+email stay on the same operator row");
assert.equal(ambiguous[0].instances.length, 2);
assert.equal(ambiguous[0].isFleetIdentity, true);

const missingIdentity = groupProfileInstances([
  profile("matebook", "MateBook", { email: "", directory: "Profile 2", profile_key: "chrome::Profile 2" }),
  profile("minipc", "MiniPC", { email: "", directory: "Profile 2", profile_key: "chrome::Profile 2" }),
]);
assert.equal(missingIdentity.length, 2, "profiles without identity remain exact installations");

assert.equal(isProfileBrowserHost("minipc"), true);
assert.equal(isProfileBrowserHost("mac-studio"), true);
assert.equal(isProfileBrowserHost("matebook"), true);
assert.equal(
  isProfileBrowserHost("macbook-air"),
  true,
  "MacBook Air is a first-class browser inventory surface when its live agent is available",
);

// --- Bug 1 regression: unreachable hosts must not be selectable Computer filters ----
import {
  matchesProfileFilters,
  profileCategory,
  profileUnavailableReason,
  selectableHostFilters,
} from "../src/lib/profile-groups.ts";

const inventories = [
  { host: { id: "minipc", label: "MiniPC" }, online: true, profiles: [] },
  { host: { id: "mac-studio", label: "Mac Studio" }, online: false, error_code: "timeout", profiles: [] },
  { host: { id: "matebook", label: "MateBook" }, online: true, profiles: [] },
];
assert.deepEqual(
  selectableHostFilters(inventories).map((option) => option.value),
  ["minipc", "matebook"],
  "an unreachable/inventory-failed host must be excluded from selectable Computer filters so a matching profile on it can never trigger a misleading empty state",
);
assert.deepEqual(
  selectableHostFilters([]),
  [],
  "an empty inventory list yields no selectable Computer filters",
);
assert.deepEqual(
  selectableHostFilters([{ host: {}, online: true }, { host: { id: "minipc", label: "" }, online: true }]).map((o) => o.value),
  ["minipc"],
  "host entries without an id are dropped and a blank label falls back to the id",
);

const onlineGroups = groupProfileInstances([
  profile("minipc", "MiniPC", { label: "Principale", email: "person2@example.test" }),
  profile("matebook", "MateBook", { label: "Principale", email: "person2@example.test" }),
]);
const selectable = new Set(selectableHostFilters(inventories).map((o) => o.value));
assert.equal(
  filterProfileGroups(onlineGroups, {
    browsers: [], providers: [], hosts: [...selectable], categories: [], query: "",
  }).length,
  1,
  "filtering by the reachable-host set still returns the matching group after the unreachable host is removed",
);
assert.equal(
  profileUnavailableReason("unreachable"),
  "computer non raggiungibile",
  "typed unreachable status is distinguished",
);
assert.equal(
  profileUnavailableReason("dns_failure"),
  "nome host non risolvibile",
  "typed dns resolution failure is distinguished",
);
assert.equal(
  profileUnavailableReason("missing_installation"),
  "agente non installato",
  "typed missing remote installation is distinguished",
);
assert.equal(
  selectable.has("minipc") && !selectable.has("mac-studio"),
  true,
  "the reachable host is selectable while Mac Studio (unreachable) is not",
);

// --- Bug 2 regression: agent errors are not \"temporaneamente non raggiungibile\" ----
assert.equal(
  profileUnavailableReason("timeout"),
  "temporaneamente non raggiungibile",
  "a network timeout is the only code that means transiently unreachable",
);
assert.notEqual(
  profileUnavailableReason("nonzero_exit"),
  "temporaneamente non raggiungibile",
  "a real remote-agent error must not be mislabeled as network unreachability",
);
assert.notEqual(
  profileUnavailableReason("agent_failed"),
  "temporaneamente non raggiungibile",
  "the backend agent_failed fallback must not be mislabeled as network unreachability",
);
assert.equal(
  profileUnavailableReason("agent_failed"),
  profileUnavailableReason("nonzero_exit"),
  "both agent-error codes share one truthful label",
);
assert.equal(
  profileUnavailableReason("unknown_code"),
  "stato non disponibile",
  "an unknown code stays a neutral state message, never a claimed transient notification",
);
assert.equal(profileUnavailableReason(""), "stato non disponibile", "a missing code stays neutral");

// --- Robustness: malformed cached fields never crash the filter library ----
assert.equal(
  profileCategory({ category: undefined, label: undefined } as unknown as Parameters<typeof profileCategory>[0]),
  "",
  "profileCategory is defensive against a cached inventory missing category/label",
);
assert.equal(
  profileCategory({ category: "  ", label: null } as unknown as Parameters<typeof profileCategory>[0]),
  "",
  "blank metadata and a null label yield an empty category",
);
assert.equal(
  matchesProfileFilters(
    { browser: undefined, hostId: undefined, alias: undefined, label: undefined, email: undefined, category: undefined, hostLabel: undefined, directory: undefined } as unknown as Parameters<typeof matchesProfileFilters>[0],
    { browsers: [], providers: [], hosts: [], categories: [], query: "" },
  ),
  true,
  "empty filters match a malformed instance instead of throwing",
);
