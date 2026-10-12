# Changelog

All notable changes to this project are documented here.
This file is generated from [Conventional Commits](https://www.conventionalcommits.org)
by [git-cliff](https://git-cliff.org); do not edit it by hand.
A release listed with no entries carried no Conventional Commit in this package's
scope: scripts/release-plan.mjs releases whenever any published file changes, not only on
conventional commits.

## [0.7.1](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.7.1) - 2026-10-11

### Styling

- Fix the oxfmt and oxlint warnings in the viewers ([db0314f](https://github.com/ChristopherVR/ooxml/commit/db0314f319e3d0508960872260792215477d9ca5))

## [0.7.0](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.7.0) - 2026-10-10

### Features

- **visio:** Make ribbon add-in tabs a prop and event of every binding ([6e6a157](https://github.com/ChristopherVR/ooxml/commit/6e6a157bbced977145d428e2ca01168e0a413deb))

## [0.6.2](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.6.2) - 2026-10-09

### Dependencies

- **deps:** Bump the production-minor-and-patch group with 5 updates ([#42](https://github.com/ChristopherVR/ooxml/issues/42)) ([fda493e](https://github.com/ChristopherVR/ooxml/commit/fda493e2697908c477ce845019d9c2fe8b591ab2))

## [0.6.1](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.6.1) - 2026-10-08

### Documentation

- Refresh the readmes with webp images and the office suite ([6a800d0](https://github.com/ChristopherVR/ooxml/commit/6a800d062bc911d6c4ea682bdbffa7fc437d1556))

## [0.6.0](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.6.0) - 2026-10-08

### Features

- **visio:** Enable source-backed formatting and shape ordering ([c39f7be](https://github.com/ChristopherVR/ooxml/commit/c39f7bee397d27afa31155a96c01997122402773))
- **visio:** Enable multi-selection formatting and arrangement ([fb70098](https://github.com/ChristopherVR/ooxml/commit/fb70098a2b100d6ec37cd091acd618c91477cfb2))
- **visio:** Enable rich formatting and source duplication ([d50e388](https://github.com/ChristopherVR/ooxml/commit/d50e388f9190809d6a860894663cdbf774ca4dca))
- **visio:** Enable source-backed shape clipboard ([2c13c1f](https://github.com/ChristopherVR/ooxml/commit/2c13c1f39998cf37e83d3949a6685f84f4b16e4d))
- **visio:** Enable new drawings and pointer selection gestures ([75ac409](https://github.com/ChristopherVR/ooxml/commit/75ac409e5e67c23203c765d3aa472b6817853090))

## [0.5.9](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.5.9) - 2026-10-08

## [0.5.8](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.5.8) - 2026-10-07

## [0.5.7](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.5.7) - 2026-10-07

### Refactor

- **visio:** Use extensionless relative source imports ([2495aa9](https://github.com/ChristopherVR/ooxml/commit/2495aa92d52a0135106695a2a39a72c9f98cf177))

## [0.5.6](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.5.6) - 2026-10-07

## [0.5.5](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.5.5) - 2026-10-06

### Refactor

- Move the library into src/core, next to src/ui ([3933a88](https://github.com/ChristopherVR/ooxml/commit/3933a88e36784ce5f4bfab0af1ca12eb65d3cd0c))

### Dependencies

- **deps:** Align emf-converter on 4.8.21 ([3c2859d](https://github.com/ChristopherVR/ooxml/commit/3c2859d0a43e66666015debaeaa985888727db95))

### Chores

- Merge the release commit into the restructure ([efdb30a](https://github.com/ChristopherVR/ooxml/commit/efdb30a34873f71211e11a39f315b5dc3c3cd82c))

## [0.5.4](https://github.com/ChristopherVR/ooxml/releases/tag/visio-react-viewer@0.5.4) - 2026-10-05

### Bug Fixes

- **viewers:** Point every package's homepage, bugs and README links at ooxml (by @ChristopherVR) ([e40592e](https://github.com/ChristopherVR/ooxml/commit/e40592e1cc1331c8223e8fcc366041a933435dee))

## 0.5.3

### Changes

- build(deps): adopt ooxml-core 0.15.0 and ooxml-ui 0.21.0 (818f4a4)

## 0.5.2

### Changes

- build(viewer): adopt ooxml-ui 0.18.2 (44f44e2)
- build(viewer): adopt ooxml-ui 0.17 (2e19d89)

## 0.5.1

### Changes

- build(viewer): adopt ooxml-ui 0.15 shared select and ribbon commands (e1fe065)

## 0.5.0

### Changes

- build(viewer): adopt token based ooxml-ui 0.13 (590a5c8)
- refactor(viewer): use shared ooxml-ui ribbon, backstage, find and rulers (cd1088b)
- feat(viewer): add visio account, options dialog and live sharing (fe7fed1)

## 0.4.0

### Changes

- feat(viewer): add pan & zoom window and a shapes strip to reopen shapes (01c5a82)
- feat(viewer): add visio keytips for keyboard ribbon access (8a9d6d1)
- feat(viewer): add visio tell me, help tab and presentation mode (d048a45)
- feat(viewer): add visio file backstage, context menus and page bar (8c54263)
- feat(viewer): add visio's shapes window with a basic shapes stencil (98cb55e)
- feat(viewer): match the visio ribbon layout with honest disabled commands (bb74402)

## 0.3.0

### Changes

- fix(packages): pin released core and shared ui dependencies (4d035f6)
- feat(visio): preview legacy VSD through the shared binary codec (6772ff3)

## 0.2.0

### Changes

- feat(bindings): expose native reactive viewer state in every binding (ccd9ba8)
- feat(viewer): add visio ribbon toolbar on shared office-ui controls (afc7047)
- fix(deps): use released core for proven master shape moves (28989be)

## 0.1.1

### Changes

- docs(packages): align npm readmes with powerpoint structure (5c6f120)
- fix(ui): match suite Pages and responsive editor composition (960d3bc)

## 0.1.0

### Changes

- feat(release): publish functional visio framework packages (bc55722)
- feat(viewer): preserve drafts across geometry edits and history (c5b585d)
- fix(viewer): align Office shell and Pages navigation (23d6912)
- feat(viewer): expose safe geometry commands and pin published core (8ddaf87)
- fix(viewer): follow the shared office theme inside frames (caad674)
- feat(ui): align Visio workspace and docs with PPTX design (011c728)
- feat(visio): restore concave arrows and rounded connectors (7662a75)

## 0.0.2

### Changes

- Initial release.
