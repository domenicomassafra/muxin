#!/bin/sh
# Repeatable donor table for plancia#1 (Obsidian-compatible web editor for the
# Muxin PWA). The JSON is the source of truth; the Markdown block between the
# donor-table markers is generated from it. Needs gh (logged in) and jq.
#
#   ./scripts/donors/vault-editor-donors.sh render       # table on stdout
#   ./scripts/donors/vault-editor-donors.sh check        # table in the doc is current
#   ./scripts/donors/vault-editor-donors.sh write        # regenerate the doc block
#   ./scripts/donors/vault-editor-donors.sh scan         # refresh GitHub data, then write
#   ./scripts/donors/vault-editor-donors.sh verify-live  # pinned commits still match upstream
#
# `render` and `check` are offline and deterministic. `scan` and `verify-live`
# call the GitHub API: the pin is the head of each default branch at scan time,
# so they drift as donors publish and must be re-run, not trusted forever.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
json=$root/docs/research/obsidian-web-editor-donors.json
doc=$root/docs/research/obsidian-web-editor-donors.md
begin='<!-- donor-table:begin -->'
end='<!-- donor-table:end -->'

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing $1" >&2
    exit 1
  }
}

render() {
  jq -r '
    "| Donor | Ruolo | Licenza | ★ | Ultimo push | Release | Commit | Vault .md | Web/PWA | Integrazione Muxin | Esito |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
    (.donors
      | sort_by(
          ({"adopt": 0, "component": 1, "alternate": 2, "read-only": 3, "reference": 4, "reject": 5}[.disposition]),
          -.stars)
      | .[]
      | [
          "[" + .repo + "](" + .url + ")",
          .role,
          .license,
          (.stars | tostring),
          .pushed_at[0:10],
          (if .release == "" then "—" else .release + " (" + .released_at[0:10] + ")" end),
          "`" + .pinned_commit[0:12] + "`",
          .vault,
          .pwa,
          .integration,
          "**" + .disposition + "** · " + .reason
        ]
      | "| " + join(" | ") + " |")
  ' "$json"
}

current_block() {
  sed -n "/$begin/,/$end/p" "$doc" | sed '1d;$d'
}

write_block() {
  grep -qF "$begin" "$doc" && grep -qF "$end" "$doc" || {
    echo "donor-table markers missing in $doc" >&2
    exit 1
  }
  tmp=$(mktemp)
  sed -n "1,/$begin/p" "$doc" >"$tmp"
  render >>"$tmp"
  sed -n "/$end/,\$p" "$doc" >>"$tmp"
  mv "$tmp" "$doc"
  echo "wrote $doc"
}

check() {
  [ -f "$json" ] || { echo "missing $json" >&2; exit 1; }
  [ -f "$doc" ] || { echo "missing $doc" >&2; exit 1; }
  if [ "$(current_block)" = "$(render)" ]; then
    echo "donor table: up to date"
  else
    echo "donor table: stale, run: $0 write" >&2
    exit 1
  fi
}

scan() {
  require gh
  require jq
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  jq -r '.donors[] | [.repo, .default_branch] | @tsv' "$json" >"$work/pins.tsv"
  while IFS='	' read -r repo branch; do
    gh api "repos/$repo" >"$work/meta.json"
    sha=$(gh api "repos/$repo/commits/$branch" --jq .sha)
    tag=$(gh api "repos/$repo/releases/latest" --jq '.tag_name' 2>/dev/null || true)
    pub=$(gh api "repos/$repo/releases/latest" --jq '.published_at' 2>/dev/null || true)
    jq --arg repo "$repo" --arg branch "$branch" --arg sha "$sha" \
      --arg tag "$tag" --arg pub "$pub" --slurpfile meta "$work/meta.json" \
      '(.donors[] | select(.repo == $repo))
       | .stars = $meta[0].stargazers_count
       | .pushed_at = $meta[0].pushed_at
       | .default_branch = $branch
       | .pinned_commit = $sha
       | .release = $tag
       | .released_at = $pub' \
      "$json" >"$work/next.json"
    mv "$work/next.json" "$json"
  done <"$work/pins.tsv"
  jq --arg day "$(date -u +%Y-%m-%d)" '.scanned_at = $day' "$json" >"$work/stamp.json"
  mv "$work/stamp.json" "$json"
  write_block
}

verify_live() {
  require gh
  require jq
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  jq -r '.donors[] | [.repo, .default_branch, .pinned_commit] | @tsv' "$json" >"$work/pins.tsv"
  while IFS='	' read -r repo branch pin; do
    live=$(gh api "repos/$repo/commits/$branch" --jq .sha 2>/dev/null || true)
    short=$(printf '%s' "$pin" | cut -c1-12)
    if [ -z "$live" ]; then
      echo "DRIFT $repo: pinned $short not resolvable on $branch"
    elif [ "$live" != "$pin" ]; then
      echo "DRIFT $repo: pinned $short, live $(printf '%s' "$live" | cut -c1-12) (run scan)"
    else
      echo "ok     $repo $short"
    fi
  done <"$work/pins.tsv" | tee "$work/report"
  if grep -q '^DRIFT' "$work/report"; then
    echo "provenance drifted: re-run scan and re-read the licenses" >&2
    exit 1
  fi
}

case "${1:---check}" in
  render) render ;;
  write) write_block ;;
  check) check ;;
  scan) scan ;;
  verify-live) verify_live ;;
  -h | --help) usage ;;
  *)
    usage
    ;;
esac
