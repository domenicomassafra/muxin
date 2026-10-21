//! Guards the donor research of plancia#1 (Obsidian-compatible editor for the
//! Muxin PWA): the JSON snapshot is the source of truth and the Markdown table
//! in docs/research must stay consistent with it. These tests are offline and
//! deterministic; refreshing the GitHub data is `scripts/donors/… scan`.

use std::collections::HashSet;

use serde_json::Value;

const DATA: &str = include_str!("../docs/research/obsidian-web-editor-donors.json");
const DOC: &str = include_str!("../docs/research/obsidian-web-editor-donors.md");
const BEGIN: &str = "<!-- donor-table:begin -->";
const END: &str = "<!-- donor-table:end -->";

const DISPOSITIONS: [&str; 6] = [
    "adopt",
    "component",
    "alternate",
    "read-only",
    "reference",
    "reject",
];
const RISKS: [&str; 5] = [
    "permissive",
    "weak-copyleft",
    "strong-copyleft",
    "source-available",
    "mixed",
];

fn data() -> Value {
    serde_json::from_str(DATA).expect("donor JSON parses")
}

fn donors() -> Vec<Value> {
    data()["donors"]
        .as_array()
        .expect("donors is an array")
        .clone()
}

fn text<'a>(donor: &'a Value, key: &str) -> &'a str {
    donor[key]
        .as_str()
        .unwrap_or_else(|| panic!("{key} is a string in {donor}"))
}

fn cell(line: &str) -> Vec<String> {
    let t = line.trim();
    let t = t.strip_prefix('|').unwrap_or(t);
    let t = t.strip_suffix('|').unwrap_or(t);
    t.split('|').map(|c| c.trim().to_string()).collect()
}

fn table() -> Vec<Vec<String>> {
    assert_eq!(
        DOC.matches(BEGIN).count(),
        1,
        "one donor table start marker"
    );
    assert_eq!(DOC.matches(END).count(), 1, "one donor table end marker");
    let start = DOC.find(BEGIN).expect("start marker") + BEGIN.len();
    let end = DOC.find(END).expect("end marker");
    assert!(start < end, "end marker follows start marker");
    let rows: Vec<Vec<String>> = DOC[start..end]
        .lines()
        .filter(|l| l.trim_start().starts_with('|'))
        .map(cell)
        .collect();
    assert!(
        rows.len() >= 3,
        "header, separator and at least one donor row"
    );
    rows
}

#[test]
fn snapshot_has_at_least_five_comparable_donors() {
    let d = data();
    assert_eq!(d["schema"], 1, "schema version");
    let scanned = d["scanned_at"].as_str().expect("scanned_at is a string");
    assert_eq!(scanned.len(), 10, "scanned_at is a YYYY-MM-DD day");
    assert_eq!(
        scanned.as_bytes()[4],
        b'-',
        "scanned_at has a month separator"
    );
    assert_eq!(
        scanned.as_bytes()[7],
        b'-',
        "scanned_at has a day separator"
    );
    let donors = donors();
    assert!(
        donors.len() >= 5,
        "at least five candidates, found {}",
        donors.len()
    );

    let mut repos = HashSet::new();
    let mut ids = HashSet::new();
    for donor in &donors {
        for key in [
            "id",
            "repo",
            "url",
            "role",
            "license",
            "license_risk",
            "vault",
            "pwa",
            "integration",
            "evidence",
        ] {
            assert!(
                !text(donor, key).trim().is_empty(),
                "{key} is filled: {donor}"
            );
        }
        assert!(
            repos.insert(text(donor, "repo")),
            "repo {} appears twice",
            donor["repo"]
        );
        assert!(
            ids.insert(text(donor, "id")),
            "id {} appears twice",
            donor["id"]
        );
        assert!(
            text(donor, "url").starts_with("https://github.com/"),
            "{} has a GitHub URL",
            donor["repo"]
        );
        assert!(
            RISKS.contains(&text(donor, "license_risk")),
            "{} has a known licence risk class",
            donor["repo"]
        );
        assert!(
            DISPOSITIONS.contains(&text(donor, "disposition")),
            "{} has a known disposition",
            donor["repo"]
        );
        assert!(
            donor["stars"].as_u64().is_some(),
            "{} has a star count",
            donor["repo"]
        );

        let push = text(donor, "pushed_at");
        assert_eq!(push.len(), 20, "{} has an ISO pushed_at", donor["repo"]);
        assert!(
            push.ends_with('Z') && push.as_bytes()[4] == b'-',
            "{} pushed_at is UTC",
            donor["repo"]
        );

        let pinned = text(donor, "pinned_commit");
        assert_eq!(pinned.len(), 40, "{} pins a full commit", donor["repo"]);
        assert!(
            pinned
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
            "{} pins a lowercase hex commit",
            donor["repo"]
        );

        let release = text(donor, "release");
        let released = text(donor, "released_at");
        assert_eq!(
            release.is_empty(),
            released.is_empty(),
            "{} states a release and its date together",
            donor["repo"]
        );
    }
}

#[test]
fn copyleft_is_reported_before_adoption() {
    let donors = donors();
    for donor in &donors {
        let risk = text(donor, "license_risk");
        let disposition = text(donor, "disposition");
        if risk != "permissive" {
            assert!(
                disposition != "adopt",
                "{} is {risk} ({}) and cannot be the adopted donor",
                donor["repo"],
                donor["license"]
            );
            assert!(
                disposition != "component",
                "{} is {risk} ({}) and cannot be a linked component",
                donor["repo"],
                donor["license"]
            );
        }
    }
    for id in ["logseq", "trilium", "siyuan", "joplin"] {
        let donor = donors
            .iter()
            .find(|d| d["id"] == id)
            .unwrap_or_else(|| panic!("{id} is in the matrix"));
        assert_eq!(
            text(donor, "license"),
            "AGPL-3.0",
            "{id} licence is recorded"
        );
    }
}

#[test]
fn exactly_one_adopted_donor_and_one_parser_component() {
    let donors = donors();
    let adopted: Vec<&Value> = donors
        .iter()
        .filter(|d| d["disposition"] == "adopt")
        .collect();
    assert_eq!(
        adopted.len(),
        1,
        "one motivated choice, found {}",
        adopted.len()
    );
    assert_eq!(
        text(adopted[0], "repo"),
        "silverbulletmd/silverbullet",
        "the choice in the docs is the adopted donor"
    );
    assert!(
        donors.iter().any(|d| d["disposition"] == "component"),
        "the reusable Rust parser is recorded as a component"
    );
}

#[test]
fn markdown_table_matches_the_snapshot() {
    let rows = table();
    let header = &rows[0];
    assert!(
        header.len() >= 8,
        "the table carries the asked columns, got {header:?}"
    );
    for column in [
        "Donor",
        "Licenza",
        "★",
        "Ultimo push",
        "Release",
        "Commit",
        "Esito",
    ] {
        assert!(
            header.iter().any(|c| c == column),
            "column {column} is present: {header:?}"
        );
    }
    assert!(
        rows[1].iter().all(|c| c.starts_with("---")),
        "second row is the separator"
    );

    let donors = donors();
    let body = &rows[2..];
    assert_eq!(body.len(), donors.len(), "one table row per donor");

    for row in body {
        assert_eq!(
            row.len(),
            header.len(),
            "every row has {} cells: {row:?}",
            header.len()
        );
    }
    for donor in &donors {
        let url = text(donor, "url");
        let matching: Vec<&Vec<String>> = body.iter().filter(|r| r[0].contains(url)).collect();
        assert_eq!(matching.len(), 1, "exactly one row links {url}");
        let row = matching[0];
        let pinned = text(donor, "pinned_commit");
        assert!(
            row[2].contains(text(donor, "license")),
            "{} shows its licence",
            donor["repo"]
        );
        assert_eq!(
            row[3],
            donor["stars"].as_u64().expect("stars").to_string(),
            "{} shows its API star count",
            donor["repo"]
        );
        assert!(
            row[6].contains(&pinned[..12]),
            "{} shows its pinned commit",
            donor["repo"]
        );
        assert!(
            row[header.len() - 1].contains(text(donor, "disposition")),
            "{} shows its disposition",
            donor["repo"]
        );
    }

    let adopted_rows = body
        .iter()
        .filter(|r| r[header.len() - 1].contains("**adopt**"))
        .count();
    assert_eq!(
        adopted_rows, 1,
        "the generated table marks one adopted donor"
    );
}

#[test]
fn research_files_stay_small_and_lf() {
    for (name, body) in [("json", DATA), ("md", DOC)] {
        assert!(!body.contains('\r'), "{name} uses LF");
        assert!(body.ends_with('\n'), "{name} ends with a newline");
        assert!(
            body.len() <= 20_000,
            "{name} stays under the 20 KB agent-file budget, is {}",
            body.len()
        );
    }
}
