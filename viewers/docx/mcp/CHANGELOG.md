# Changelog

All notable changes to this project are documented here.
This file is generated from [Conventional Commits](https://www.conventionalcommits.org)
by [git-cliff](https://git-cliff.org); do not edit it by hand.
A release listed with no entries carried no Conventional Commit in this package's
scope: scripts/release-plan.mjs releases whenever any published file changes, not only on
conventional commits.

## [0.1.9](https://github.com/ChristopherVR/ooxml/releases/tag/docx-viewer-mcp@0.1.9) - 2026-10-10

### Styling

- Apply oxfmt to files drifted from the formatter ([daeabf2](https://github.com/ChristopherVR/ooxml/commit/daeabf26125af866f90359ac8a5716234d5b8b36))

## [0.1.8](https://github.com/ChristopherVR/ooxml/releases/tag/docx-viewer-mcp@0.1.8) - 2026-10-09

### Dependencies

- **deps:** Bump the production-minor-and-patch group with 5 updates ([#42](https://github.com/ChristopherVR/ooxml/issues/42)) ([fda493e](https://github.com/ChristopherVR/ooxml/commit/fda493e2697908c477ce845019d9c2fe8b591ab2))

## [0.1.7](https://github.com/ChristopherVR/ooxml/releases/tag/docx-viewer-mcp@0.1.7) - 2026-10-08

### Documentation

- Refresh the readmes with webp images and the office suite ([6a800d0](https://github.com/ChristopherVR/ooxml/commit/6a800d062bc911d6c4ea682bdbffa7fc437d1556))

## [0.1.6](https://github.com/ChristopherVR/ooxml/releases/tag/docx-viewer-mcp@0.1.6) - 2026-10-08

### Bug Fixes

- **ci:** Recover unpublished releases and validate manifests ([ae190df](https://github.com/ChristopherVR/ooxml/commit/ae190df2352283303858719fe1db5e58b86903fb))

## [0.1.5](https://github.com/ChristopherVR/ooxml/releases/tag/docx-viewer-mcp@0.1.5) - 2026-10-07

### Refactor

- Move the library into src/core, next to src/ui ([3933a88](https://github.com/ChristopherVR/ooxml/commit/3933a88e36784ce5f4bfab0af1ca12eb65d3cd0c))

### Chores

- Merge the release commit into the restructure ([efdb30a](https://github.com/ChristopherVR/ooxml/commit/efdb30a34873f71211e11a39f315b5dc3c3cd82c))

## [0.1.4](https://github.com/ChristopherVR/ooxml/releases/tag/docx-viewer-mcp@0.1.4) - 2026-10-05

### Bug Fixes

- **viewers:** Point every package's homepage, bugs and README links at ooxml (by @ChristopherVR) ([e40592e](https://github.com/ChristopherVR/ooxml/commit/e40592e1cc1331c8223e8fcc366041a933435dee))

# Changelog

All notable changes to this project are documented here.
This file is generated from [Conventional Commits](https://www.conventionalcommits.org)
by [git-cliff](https://git-cliff.org); do not edit it by hand.
A release listed with no entries carried no Conventional Commit in this package's
scope: scripts/release-plan.mjs re-releases a package whenever any of its files, or an internal
dependency it ships against, changes, not only on conventional commits.

## [0.1.3](https://github.com/ChristopherVR/docx-viewer/releases/tag/docx-viewer-mcp@0.1.3) - 2026-10-05

### Build & CI

- **deps:** Update all dependencies to latest (by @ChristopherVR) ([b0fd02d](https://github.com/ChristopherVR/docx-viewer/commit/b0fd02decdbcdca871d4ac8b21967c6a24d4cbbf))

## [0.1.2](https://github.com/ChristopherVR/docx-viewer/releases/tag/docx-viewer-mcp@0.1.2) - 2026-10-03

### Documentation

- **packages:** Align npm readmes with powerpoint structure (by @ChristopherVR) ([e6c664c](https://github.com/ChristopherVR/docx-viewer/commit/e6c664ccc06d5e207e4fd7c5a455433ab8868976))

## [0.1.1](https://github.com/ChristopherVR/docx-viewer/releases/tag/docx-viewer-mcp@0.1.1) - 2026-10-03

### Features

- **layout:** Add pagination engine and Print Layout view (by @ChristopherVR) ([c30c6e1](https://github.com/ChristopherVR/docx-viewer/commit/c30c6e1d456e2357239468e1946d4577e544fb9c))
- **release:** Add core backed Word MCP tools (by @ChristopherVR) ([ebae8c7](https://github.com/ChristopherVR/docx-viewer/commit/ebae8c7a59641b3b3a59dc41c193d77e303d0bb4))

### Bug Fixes

- **packaging:** Viewer Svelte component imports bindings helpers; typed svelte.d.ts (by @claude) ([ac57529](https://github.com/ChristopherVR/docx-viewer/commit/ac575296c0d13efb5ac4625c34ffd136b1e6c603))
- **release:** Stage planned package versions and changelogs (by @ChristopherVR) ([652c149](https://github.com/ChristopherVR/docx-viewer/commit/652c1498f4fd939c81cee0c10b7b9ad5e0525944))

### Other

- Interrupted parity workstream (see docs/outstanding-work.md) (by @ChristopherVR) ([b4d3e44](https://github.com/ChristopherVR/docx-viewer/commit/b4d3e44463195e949316d3ac6df7bf9137485b4a))

### Refactor

- **packages:** Publish one self-contained package per framework (by @ChristopherVR) ([f009c62](https://github.com/ChristopherVR/docx-viewer/commit/f009c6266315805753bcc55ce0688272396a8d9b))
- Adopt ooxml-core layout, load and collab areas (by @ChristopherVR) ([aa42730](https://github.com/ChristopherVR/docx-viewer/commit/aa427301f8af62707e50db6c915afa0b91b579a6))

### Build & CI

- Publish under unscoped docx-* package names (by @ChristopherVR) ([44b369f](https://github.com/ChristopherVR/docx-viewer/commit/44b369ff2df6e34f210f7752ebd510df9464b405))

### Chores

- **types:** Enable noUncheckedIndexedAccess; keep test-support out of release builds (by @claude) ([203b289](https://github.com/ChristopherVR/docx-viewer/commit/203b289f0e8ca5d877cc6ff990ebc35755a853a3))
- Renamed ooxml packages [ci-skip] (by @ChristopherVR) ([3e75728](https://github.com/ChristopherVR/docx-viewer/commit/3e757282589b0327b90657d0d4c4e9350ce5025a))


