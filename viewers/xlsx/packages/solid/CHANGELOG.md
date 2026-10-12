# Changelog

All notable changes to this project are documented here.
This file is generated from [Conventional Commits](https://www.conventionalcommits.org)
by [git-cliff](https://git-cliff.org); do not edit it by hand.
A release listed with no entries carried no Conventional Commit in this package's
scope: scripts/release-plan.mjs releases whenever any published file changes, not only on
conventional commits.

## [0.6.0](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.6.0) - 2026-10-10

### Features

- **xlsx:** Make ribbon add-in tabs a prop and event of every binding ([691f553](https://github.com/ChristopherVR/ooxml/commit/691f5531b9f5b4a5a5ac0645b43c8c0fc55be5d8))

## [0.5.1](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.5.1) - 2026-10-08

### Documentation

- Refresh the readmes with webp images and the office suite ([6a800d0](https://github.com/ChristopherVR/ooxml/commit/6a800d062bc911d6c4ea682bdbffa7fc437d1556))

## [0.5.0](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.5.0) - 2026-10-08

### Features

- **xlsx:** Expose collaboration in every binding ([2983ccc](https://github.com/ChristopherVR/ooxml/commit/2983ccc1e5d72749a31d2540e8f57b637f282b3e))

## [0.4.6](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.4.6) - 2026-10-08

## [0.4.5](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.4.5) - 2026-10-07

## [0.4.4](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.4.4) - 2026-10-07

## [0.4.3](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.4.3) - 2026-10-07

## [0.4.2](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.4.2) - 2026-10-06

### Refactor

- Move the library into src/core, next to src/ui ([3933a88](https://github.com/ChristopherVR/ooxml/commit/3933a88e36784ce5f4bfab0af1ca12eb65d3cd0c))

### Chores

- Merge the release commit into the restructure ([efdb30a](https://github.com/ChristopherVR/ooxml/commit/efdb30a34873f71211e11a39f315b5dc3c3cd82c))

## [0.4.1](https://github.com/ChristopherVR/ooxml/releases/tag/xlsx-solid-viewer@0.4.1) - 2026-10-05

### Bug Fixes

- **viewers:** Point every package's homepage, bugs and README links at ooxml (by @ChristopherVR) ([e40592e](https://github.com/ChristopherVR/ooxml/commit/e40592e1cc1331c8223e8fcc366041a933435dee))

# Changelog

All notable changes to this project are documented here.
This file is generated from [Conventional Commits](https://www.conventionalcommits.org)
by [git-cliff](https://git-cliff.org); do not edit it by hand.
A release listed with no entries carried no Conventional Commit in this package's
scope: scripts/release-plan.mjs re-releases a package whenever any of its files, or an internal
dependency it ships against, changes, not only on conventional commits.

## [0.4.0](https://github.com/ChristopherVR/xlsx-viewer/releases/tag/xlsx-solid-viewer@0.4.0) - 2026-10-05

### Features

- **web-component:** Add iterative calculation to File options (by @ChristopherVR) ([d5f1e4c](https://github.com/ChristopherVR/xlsx-viewer/commit/d5f1e4cc7d0feb0fc7847599bfaba27a46ee1f47))

### Bug Fixes

- **web-component:** Ask for the password when only the SHA-512 hash is set (by @ChristopherVR) ([55bd264](https://github.com/ChristopherVR/xlsx-viewer/commit/55bd264ebeb92b470df4a48e639327e68dcb85d8))

### Refactor

- **web-component:** Draw the title bar, status bar and File view with shared elements (by @ChristopherVR) ([6dc3085](https://github.com/ChristopherVR/xlsx-viewer/commit/6dc3085a6b642a5036eedd09098f04c192da84e2))
- **web-component:** Draw the tab row, File button and collapse with office-ui-ribbon (by @ChristopherVR) ([c15e3db](https://github.com/ChristopherVR/xlsx-viewer/commit/c15e3db64eb32f4d0b38ae024dad850952e73df1))
- **web-component:** Fold ribbon groups with the shared createRibbonOverflow (by @ChristopherVR) ([258045b](https://github.com/ChristopherVR/xlsx-viewer/commit/258045b9a332786eac72ace14b84727e944ffbee))
- **web-component:** Use the shared KeyTip assignment and badges (by @ChristopherVR) ([e022e06](https://github.com/ChristopherVR/xlsx-viewer/commit/e022e06eec847d0842104ca01365ac32078e2da0))
- **web-component:** Import the formula text helpers from ooxml-core (by @ChristopherVR) ([be896de](https://github.com/ChristopherVR/xlsx-viewer/commit/be896de75c8d13d5879f7debfdd320bdd4336091))

### Build & CI

- **deps:** Adopt ooxml-core 0.17.0 and ooxml-ui 0.25.0 (by @ChristopherVR) ([49705cd](https://github.com/ChristopherVR/xlsx-viewer/commit/49705cd85cae5c14275ef15a544c689a3867abe4))
- **deps:** Adopt ooxml-ui 0.26.0 (by @ChristopherVR) ([94984f9](https://github.com/ChristopherVR/xlsx-viewer/commit/94984f959c1c75265294e5c49e3c22071e1f54f4))
- **deps:** Adopt ooxml-ui 0.27.0 (by @ChristopherVR) ([f24314b](https://github.com/ChristopherVR/xlsx-viewer/commit/f24314b56e662a05c6095338f32779536cc0d465))
- **deps:** Adopt ooxml-core 0.18.0 and ooxml-ui 0.27.1 (by @ChristopherVR) ([6e66a43](https://github.com/ChristopherVR/xlsx-viewer/commit/6e66a43e8966eedc4bd19934e27085be76d33a95))
- **deps:** Adopt ooxml-core 0.19.0 (by @ChristopherVR) ([d981768](https://github.com/ChristopherVR/xlsx-viewer/commit/d981768e1f6c5f612ea6c69aaf9507933a5a694f))

## [0.3.4](https://github.com/ChristopherVR/xlsx-viewer/releases/tag/xlsx-solid-viewer@0.3.4) - 2026-10-05

### Refactor

- **web-component:** Use the shared office-ui-context-menu (by @ChristopherVR) ([6aa323c](https://github.com/ChristopherVR/xlsx-viewer/commit/6aa323ce664715552c7e35da4c8ef6611b1d1bc4))

### Build & CI

- **deps:** Adopt ooxml-core 0.14.1 and ooxml-ui 0.20 (by @ChristopherVR) ([2da396d](https://github.com/ChristopherVR/xlsx-viewer/commit/2da396d66cad5cb74915d665258ac8216c3cd602))
- **deps:** Adopt ooxml-core 0.15.0 and ooxml-ui 0.21.0 (by @ChristopherVR) ([6cbd2b5](https://github.com/ChristopherVR/xlsx-viewer/commit/6cbd2b5ad65734a3d9ce7f2c8feff93d975eafe5))

## [0.3.3](https://github.com/ChristopherVR/xlsx-viewer/releases/tag/xlsx-solid-viewer@0.3.3) - 2026-10-03

### Documentation

- **packages:** Align npm readmes with powerpoint structure (by @ChristopherVR) ([afbbf9c](https://github.com/ChristopherVR/xlsx-viewer/commit/afbbf9c9a88f70e0afeec47da60e6cd9339c76ba))

## [0.3.2](https://github.com/ChristopherVR/xlsx-viewer/releases/tag/xlsx-solid-viewer@0.3.2) - 2026-10-03

### Bug Fixes

- **release:** Stage planned package versions and changelogs (by @ChristopherVR) ([66e7c29](https://github.com/ChristopherVR/xlsx-viewer/commit/66e7c29b4c8d5109c358ac1df77a4afad91a86f1))

## [0.3.0](https://github.com/ChristopherVR/xlsx-viewer/releases/tag/xlsx-solid-viewer@0.3.0) - 2026-10-03

### Features

- **web-component:** Adopt core encryption and workbook features (by @ChristopherVR) ([857348f](https://github.com/ChristopherVR/xlsx-viewer/commit/857348fb817ce99d773c8d4dad6258ff1dc93384))

## [0.2.0](https://github.com/ChristopherVR/xlsx-viewer/releases/tag/xlsx-solid-viewer@0.2.0) - 2026-10-03

### Features

- **bindings:** Keep in-editor changes and add readOnly/ribbon callbacks (by @ChristopherVR) ([6196ce1](https://github.com/ChristopherVR/xlsx-viewer/commit/6196ce10a9145bb1a409bd694086b772740045fa))

### Bug Fixes

- **web-component:** Restore sheet selections and fire selection once (by @ChristopherVR) ([fdfe205](https://github.com/ChristopherVR/xlsx-viewer/commit/fdfe205cd0a3bdb3ad575447a5bd842591eae942))
- **deps:** Depend on ooxml-core ^0.9.0 and ooxml-ui ^0.1.8 (by @ChristopherVR) ([e2a8ae6](https://github.com/ChristopherVR/xlsx-viewer/commit/e2a8ae63533262f4fef4fb8c93feadd3ca3b15b8))

## [0.1.1](https://github.com/ChristopherVR/xlsx-viewer/releases/tag/xlsx-solid-viewer@0.1.1) - 2026-10-03

### Features

- Add the Excel viewer and editor (by @ChristopherVR) ([408fe71](https://github.com/ChristopherVR/xlsx-viewer/commit/408fe71adc283e887cca4e873673daa6934957d5))


