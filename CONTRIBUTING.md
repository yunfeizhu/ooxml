# Contributing to ooxml-core

Thanks for wanting to help. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first. Found a security problem? Do **not** open a public issue: see [SECURITY.md](SECURITY.md). Questions and early ideas belong in [Discussions](https://github.com/ChristopherVR/ooxml/discussions) (Q&A and Ideas); issues are for bugs and agreed feature requests.

## What belongs here

This repository is the single package `ooxml-core`: all the logic behind the Office viewers (`docx-viewer`, `pptx-viewer`, `xlsx-viewer`), organised as **areas** under `src/core/<area>/`, each a subpath export (`ooxml-core/xml`). The viewers keep only their UI.

- Shared modern OOXML (units, colour, geometry, XML, OPC, and later DrawingML, charts, diagrams) goes in its own area.
- Format-specific code goes in `docx`, `pptx` or `xlsx`.
- Legacy binary formats (DOC, XLS, PPT, the compound-file container) belong in [`ole2`](https://github.com/ChristopherVR/ole2), not here. Modern OOXML never goes into `ole2`.
- UI (components, ribbons, dialogs, styling) belongs in the viewer repositories.
- Do not add a second package; add an area. Read [AGENTS.md](AGENTS.md) for the full working agreements.

## Getting set up

You need [Bun](https://bun.sh/) and Node.js 22 or newer.

```bash
git clone https://github.com/ChristopherVR/ooxml.git
cd ooxml
bun install
bun run typecheck   # strict project and the pptx project
bun run test
bun run build
bun run test:package   # packs the build and imports every entry point from a clean install
```

The pptx tests read real decks from `src/core/pptx/__tests__/fixtures`, including a committed snapshot of the pptx-viewer end-to-end decks under `fixtures/e2e`; everything needed is in this repository.

## Code rules

- TypeScript is **strict**, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. The `src/core/pptx` area is compiled with relaxed flags while it is tightened; new code anywhere else must pass the strict project.
- Keep modules under about 300 lines. Tests live next to the code (`*.test.ts`).
- Add a regression test for every parsing, preservation, round-trip or editing change. Real-file fixtures beat hand-built XML.
- Unsupported features must be reported, never silently dropped, and nothing may claim Office parity or lossless export without evidence.
- When moving code in from another repository, add an entry to [PROVENANCE.md](PROVENANCE.md) (source, path, commit, what changed).
- Formatting is `oxfmt` (`bun run fmt`); the project uses tabs and single quotes.

## Commit conventions

Commits **must** follow [Conventional Commits](https://www.conventionalcommits.org). This is load-bearing, not cosmetic: the published package is versioned and released automatically, and **the bump level is derived from your commit type**. A mislabelled commit mis-versions the package, and a non-conforming commit is silently dropped from the changelog. The `Conventional Commits` check on every pull request validates the PR title and every commit subject (`scripts/check-conventional-commits.mjs`).

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **type**: `feat` (minor bump); `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `style`, `chore`, `revert` (patch bump). A `!` after the type/scope, or a `BREAKING CHANGE:` footer, bumps major.
- **scope**: the area: `units`, `color`, `geometry`, `xml`, `opc`, `docx`, `pptx`, `ci`, `deps`, `docs`.
- **subject**: imperative, lower-case, no trailing period, header at most 72 characters.

Whether a commit releases at all is decided by the **paths it touches**, not its type: only changes to a package's published files release a new version of that package (for `ooxml-core`: `src/core/` outside tests, the bundler and declaration configs, the manifest's shipping fields, the licence files; for `ooxml-ui`: everything under `src/ui/` outside tests). Tests, docs, CI and fixtures never do, whatever their type, and a test-only `feat` does not raise the bump level. See [docs/releasing.md](docs/releasing.md).

Examples: `feat(xml): add a streaming serializer`, `fix(opc): resolve relative part names`, `feat(docx)!: rename the section model`.

The release workflow writes `chore(release): bump versions and update changelogs [skip ci]` commits to `main`; do not edit the version or `CHANGELOG.md` by hand.

## Pull requests

- Keep pull requests focused; describe what changed and how you checked it. CI runs typecheck, tests, the release-script tests, build and the package smoke test, and must be green (`ci-success`).
- Releases are cut automatically from `main` (hourly, plus manual dispatch); do not bump versions in pull requests.
- Besides CI, a pull request gets feedback it does not have to act on to merge:
  - annotations on the diff from oxlint, CodeQL, and (for workflow changes) actionlint and zizmor;
  - a **bundle size** comment when an entry point of `ooxml-core` or `ooxml-ui` changes size
    (`scripts/bundle-size.mjs`, posted by `.github/workflows/bundle-size-comment.yml`);
  - a **pkg.pr.new** comment with install URLs for preview builds of both packages, so a viewer or
    app can try the change before it is released (`.github/workflows/preview-packages.yml`);
  - a review from **CodeRabbit** (`.coderabbit.yaml`): suggestions, not a required check.
- `ci-success` also requires no em-dash in the lines you add
  (`scripts/check-em-dashes.mjs`), and the packed packages' types must resolve under NodeNext and
  bundlers (`scripts/check-package-types.mjs`, Are the Types Wrong).
- Before pushing, `bun run verify` runs locally what CI would run for your commits (the CI planner's
  lint, format, typecheck, affected-test and viewer checks), without the browser suites unless you
  add `--browser`. Use the Bun version CI uses (`bun-version` in `.github/actions/setup/action.yml`).
- On a fork, a manual run of the CI workflow can be scoped to your change: choose scope `changed`
  and give the upstream commit your branch started from as the base. The default is a full run.
- To tell whether a failure is yours or already upstream, run the same scoped checks with
  `on_base` ticked: they then run on the base commit, in the same CI environment. A local pass
  alone does not show a failure is unrelated. Report a baseline failure separately rather than
  fixing it inside a focused pull request.

## Labels, alerts and dependencies

- Pull requests are labelled from the files they touch (`.github/labeler.yml`: `area: *`, `viewer: *`, `ci`, `tests`, `documentation`, `dependencies`), and `breaking` is added for a `!` or `BREAKING CHANGE:` commit. A `size: XS` to `size: XL` label counts the changed lines, leaving out lockfiles, snapshots and fixtures. Issues and pull requests without activity are marked `stale` (90 days for issues, 45 for pull requests) and closed 14 days later unless they are pinned, security, awaiting triage, milestoned or assigned (`.github/workflows/stale.yml`). New issues get `needs-triage` and an `area: *` label from the form's dropdown; a bug report without a sample file also gets `needs-repro`. The labels themselves live in `.github/labels.json` and are synced to GitHub by `.github/workflows/labels.yml`.
- Dependabot (`.github/dependabot.yml`) opens weekly update PRs, grouped: one for production and one for development minor/patch updates, plus lockstep groups (Angular, Playwright, Yjs, Lit, `@types/*`) and one for GitHub Actions. Security updates are grouped separately; version updates wait three days after a release, so a compromised version is usually pulled before it is proposed. TypeScript major bumps are ignored on purpose. Review a grouped PR as one change; if a single dependency in it breaks the build, pin or ignore that one and let the rest through.
- Dependency review comments on and fails a PR that adds a dependency with a known high-severity vulnerability, and CodeQL scans pull requests, `main` and weekly (`.github/workflows/security.yml`). Workflow changes are checked by actionlint and zizmor (`.github/workflows/workflow-lint.yml`, policy in `.github/zizmor.yml`: third-party actions are pinned to a commit SHA), and OpenSSF Scorecard rates the supply-chain setup weekly. A weekly link check keeps one `broken-links` issue up to date. Dependabot alerts, security updates and secret scanning with push protection are enabled in the repository settings.

## License

By contributing you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
