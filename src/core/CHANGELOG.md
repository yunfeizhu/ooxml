# Changelog

All notable changes to this project are documented here.
This file is generated from [Conventional Commits](https://www.conventionalcommits.org)
by [git-cliff](https://git-cliff.org); do not edit it by hand.
A release listed with no entries carried no Conventional Commit in this package's
scope: scripts/release-plan.mjs releases whenever any published file changes, not only on
conventional commits.

## [1.8.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.8.2) - 2026-10-11

### Testing

- **ui:** Keep each DOM environment and test state in its own worker ([6d52bec](https://github.com/ChristopherVR/ooxml/commit/6d52bec41343129aa621e11e173fe3c706e82b6e))

### Styling

- Fix the oxfmt and oxlint warnings outside the viewers ([cd66f32](https://github.com/ChristopherVR/ooxml/commit/cd66f324a45aad1d9bd680d1518f0dbe8baf8fc3))

## [1.8.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.8.1) - 2026-10-10

### Bug Fixes

- **xlsx:** Reject insertions that discard boundary data ([#49](https://github.com/ChristopherVR/ooxml/issues/49)) ([ee4414d](https://github.com/ChristopherVR/ooxml/commit/ee4414d90569b64f940428108297a5096a6f355f))

### Testing

- **ci:** Share workers across core test files ([a3087e5](https://github.com/ChristopherVR/ooxml/commit/a3087e55b8ac838a6d379cdcd3d05d77870e7c7b))

## [1.8.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.8.0) - 2026-10-10

### Features

- **color:** Add the Office theme colour palette to the color area ([646b6b5](https://github.com/ChristopherVR/ooxml/commit/646b6b532a304013f0c8783801ab3401de8a1950))
- **visio:** Add AutoConnect arrows with a Quick Shapes mini toolbar ([55c5f4b](https://github.com/ChristopherVR/ooxml/commit/55c5f4bb7652d7f3ea70515357ab4815b8461b72))
- **visio:** Read the document stencil and drop masters as instances ([d42becb](https://github.com/ChristopherVR/ooxml/commit/d42becbf8a535bc31032f0b46302cbd5f0c75a50))
- **visio:** Route right-angle connectors around placeable shapes ([4acecba](https://github.com/ChristopherVR/ooxml/commit/4acecba8ed23fd56f769aa9398c9ce1997f0eade))
- **visio:** Resize, rotate and format stencil instances like Visio ([9065221](https://github.com/ChristopherVR/ooxml/commit/90652214da054224a7437ddcd05aa504577b9c24))
- **visio:** Offer resize, move, rotate and formatting on stencil shapes ([6795c0e](https://github.com/ChristopherVR/ooxml/commit/6795c0ed6106f781178a49aecefd687993998479))
- **ribbon:** Add a core area for the ribbon add-in tab descriptor ([7b2fa48](https://github.com/ChristopherVR/ooxml/commit/7b2fa48d2562d7483e03acf573e74404342b8f2a))
- **visio:** Make ribbon add-in tabs a prop and event of every binding ([6e6a157](https://github.com/ChristopherVR/ooxml/commit/6e6a157bbced977145d428e2ca01168e0a413deb))
- **visio:** Draw line jumps and toggle them from Design > Connectors ([842ddbb](https://github.com/ChristopherVR/ooxml/commit/842ddbb2f64602a3c201678d73bb01aa45cfd9d7))
- **visio:** Add the Ruler & Grid dialog, saved to the page ([f6646a8](https://github.com/ChristopherVR/ooxml/commit/f6646a84815af9148b7e18351eb4b2488b47d6d4))
- **visio:** Add the Snap & Glue dialog, saved to the drawing ([f96c927](https://github.com/ChristopherVR/ooxml/commit/f96c927906a6e4d6872b4667439726460d91dd61))
- **visio:** Insert a horizontal legend from Data > Insert Legend ([92ac505](https://github.com/ChristopherVR/ooxml/commit/92ac5055f1325d1bff1472d822d31d027d80455c))
- **visio:** Edit instances of group masters as Visio saves them ([9c75d99](https://github.com/ChristopherVR/ooxml/commit/9c75d99290521b8dfb7af625ff340612e25ee3e0))
- **visio:** Edit stencil groups and their parts in the viewer ([977bc39](https://github.com/ChristopherVR/ooxml/commit/977bc397b2255bfc8e10462dadfec63544a3816c))
- **text:** Add the fonts' design advance widths, regular and bold ([15f7eeb](https://github.com/ChristopherVR/ooxml/commit/15f7eebb692c4cf43d8febdd49070e583daef22a))
- **visio:** Size shapes from their text as Visio does ([e709f5f](https://github.com/ChristopherVR/ooxml/commit/e709f5fd055d76b50153f2271f5544b29ac05d02))
- **visio:** Lay Visio's Dynamic connector out again, as Visio saves it ([24cbff5](https://github.com/ChristopherVR/ooxml/commit/24cbff57daa30ef5b2d445ec24c36c6c5b36a681))
- **visio:** Offer glue and end handles on stencil shapes and connectors ([7d815b9](https://github.com/ChristopherVR/ooxml/commit/7d815b9f29508f5427a70abcab7728d9a57a785d))
- **visio:** Drop the Dynamic connector from the Document Stencil ([93eb00a](https://github.com/ChristopherVR/ooxml/commit/93eb00ae70b5ffd830c7644a1910fac39faf7b68))
- **visio:** Delete, copy, order, group and re-master stencil shapes ([d46f268](https://github.com/ChristopherVR/ooxml/commit/d46f2688d1498ba11ed6060a1c340e4843e3fa2a))
- **visio:** Save picked theme colours as Visio's theme formulas ([90995ba](https://github.com/ChristopherVR/ooxml/commit/90995ba8ad94e1b82f277a4c44405a3b77236a5f))
- **visio:** Pick theme colours that follow the page theme ([d29c9c7](https://github.com/ChristopherVR/ooxml/commit/d29c9c7b8ae343821db3461ca55af2283d6a19ef))
- **visio:** Edit line ends, line cap and corner rounding ([a856227](https://github.com/ChristopherVR/ooxml/commit/a85622756c98334e02653873769299a44a002f57))
- **visio:** Add stencil masters to a drawing and drop instances of them ([92474f8](https://github.com/ChristopherVR/ooxml/commit/92474f8007c1c542d524c0a4e952e8423052e4c7))
- **visio:** Build the sample drawing from stencil master instances ([1875739](https://github.com/ChristopherVR/ooxml/commit/1875739c832d19c78f687c2538db4a9d1b63aa5e))

### Bug Fixes

- **pptx:** Verify certificate chains with node:crypto, not node-forge ([51e6312](https://github.com/ChristopherVR/ooxml/commit/51e6312aa152a47ac11a6beced49b373adf0fb68))
- **visio:** Keep right-angle routes straight between close shapes ([9cdc70e](https://github.com/ChristopherVR/ooxml/commit/9cdc70e731bc50b580c90112eff53b41a4fd3c51))
- **visio:** Edit drawn shapes beside point glue and free connectors ([ba77be8](https://github.com/ChristopherVR/ooxml/commit/ba77be8bb626c0c5ae523a258f1966a1c87869c4))
- **visio:** Find master Scratch and Connections rows named from one ([e371a7c](https://github.com/ChristopherVR/ooxml/commit/e371a7cd5b16e8d827369e1c8ad65bcefc31b67b))
- **visio:** Keep a dropped shape's size cached beside its pin ([db60177](https://github.com/ChristopherVR/ooxml/commit/db601772e28ec9913cac6435139f3e469d7fcd34))
- **xlsx:** Rebase relative rules before deleting their anchors ([#47](https://github.com/ChristopherVR/ooxml/issues/47)) ([779768d](https://github.com/ChristopherVR/ooxml/commit/779768db3549cfd3c395aee779cabfa75e007feb))
- **xlsx:** Keep table filters on their source columns ([#51](https://github.com/ChristopherVR/ooxml/issues/51)) ([5368355](https://github.com/ChristopherVR/ooxml/commit/536835596eeb7ffee3908c8b75ea5f6db5191f42))
- **xlsx:** Decode windows-1252 CSV bytes without relying on the runtime ([4c371aa](https://github.com/ChristopherVR/ooxml/commit/4c371aad3f99eb98e9d478dec6e844dd1831e8df))

### Refactor

- **geometry:** Move the orthogonal connector router out of pptx ([7628894](https://github.com/ChristopherVR/ooxml/commit/7628894c847d098846b7250e8cf7cfee0b8e1ecd))
- **ui:** Move Excel and Word colour pickers onto the shared grid ([ab332b6](https://github.com/ChristopherVR/ooxml/commit/ab332b6ed7a4b80bc5016de05efb3fad694c85de))
- **visio:** Format date-picture tokens through a switch ([069774b](https://github.com/ChristopherVR/ooxml/commit/069774bdfdf476f52fef96032beb7995399e931b))

### Documentation

- **visio:** Format the Visio and ooxml-ui READMEs ([cd76ee2](https://github.com/ChristopherVR/ooxml/commit/cd76ee27e0961385949517e7e95a8405aecbcf35))

### Testing

- **visio:** Align stencil-instance tests with the merged behaviour ([1f184fd](https://github.com/ChristopherVR/ooxml/commit/1f184fde8172da3c5fee2d204b401a11e57633b7))
- **visio:** Drop an unused import from the master move tests ([15a50f9](https://github.com/ChristopherVR/ooxml/commit/15a50f997d72e3ae4990e368a071001ad0ae3e4b))
- **visio:** Prove the instance-based sample takes every shape command ([65e5427](https://github.com/ChristopherVR/ooxml/commit/65e5427b27c1e983807c2f060f571c3dc36be59a))

### Styling

- Apply oxfmt to files drifted from the formatter ([daeabf2](https://github.com/ChristopherVR/ooxml/commit/daeabf26125af866f90359ac8a5716234d5b8b36))

### Chores

- **ci:** Drop prettier leftovers and align oxfmt range ([6b85898](https://github.com/ChristopherVR/ooxml/commit/6b858982d1cbf2539cb523122d2ab048b6343ee8))

## [1.7.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.7.0) - 2026-10-10

### Features

- **visio:** Add createSampleVsdx, an editable sample drawing ([a8f4f7d](https://github.com/ChristopherVR/ooxml/commit/a8f4f7d1c378ce3a011b6638dedc8c8abb02acc1))
- **geometry:** Share arrow-key nudges and Shift angle snapping ([a839871](https://github.com/ChristopherVR/ooxml/commit/a8398713b97bcc9a193e6bd85aba51c55066eba8))
- **visio:** Nudge with arrow keys and snap moves to the grid ([efacb75](https://github.com/ChristopherVR/ooxml/commit/efacb75c896f64a7252b9200c5e0e0d4ba0f13e9))
- **visio:** Edit the text of stencil (master) instances ([672e65c](https://github.com/ChristopherVR/ooxml/commit/672e65cc1df75dc5cfbb8639938413c7d5e089c2))
- **visio:** Edit formatted, field and partial text of stencil shapes ([2779656](https://github.com/ChristopherVR/ooxml/commit/27796562ef728a6be884967e9ed84323c480c16b))
- **visio:** Add Layer Properties as Visio's dialog, saved to the drawing ([8091265](https://github.com/ChristopherVR/ooxml/commit/809126590cbae8e7e41c80e3261754fe2afbb0ee))

### Bug Fixes

- **visio:** Report refused edits in plain words ([41f6e2e](https://github.com/ChristopherVR/ooxml/commit/41f6e2e3cc3dbca4213f79530c802269e3da6603))

### Testing

- **core:** Fuzz the xml, formula, number format and hyperlink parsers ([c6911a0](https://github.com/ChristopherVR/ooxml/commit/c6911a00f79fb07eab294d885b760452b4bdaf72))

### Build & CI

- Scope write permissions to jobs and look up date tokens in a map ([c6021c4](https://github.com/ChristopherVR/ooxml/commit/c6021c46cb93d7531d7b45ec713c74fe81510104))

### Styling

- **visio:** Format the stencil-instance text test ([87608ae](https://github.com/ChristopherVR/ooxml/commit/87608aeb6c37839967137bbdc634fed643e7410b))

## [1.6.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.6.2) - 2026-10-09

### Dependencies

- **deps:** Bump the production-minor-and-patch group with 5 updates ([#42](https://github.com/ChristopherVR/ooxml/issues/42)) ([fda493e](https://github.com/ChristopherVR/ooxml/commit/fda493e2697908c477ce845019d9c2fe8b591ab2))

### Chores

- **deps-dev:** Bump the development-minor-and-patch group across 1 directory with 6 updates ([#43](https://github.com/ChristopherVR/ooxml/issues/43)) ([e3a4861](https://github.com/ChristopherVR/ooxml/commit/e3a4861279b8d2bbf3b869617329eddb953b7838))

## [1.6.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.6.1) - 2026-10-09

### Bug Fixes

- **pptx:** Paint the outline gradient of chart line series ([#41](https://github.com/ChristopherVR/ooxml/issues/41)) ([158d44b](https://github.com/ChristopherVR/ooxml/commit/158d44bd79582591697e9d6ef8ccc5311dc6d1f4))

## [1.6.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.6.0) - 2026-10-09

### Features

- **visio:** Create freeform, pencil and arc paths ([eeb6956](https://github.com/ChristopherVR/ooxml/commit/eeb69560e18ce57e7e7dac4cfaf5ab8594525b55))
- **visio:** Change a local shape's outline to a basic shape ([8c808e9](https://github.com/ChristopherVR/ooxml/commit/8c808e962df0171d9d5057f18ec58af63b527ffa))
- **visio:** Add change case and format painter commands ([85440e1](https://github.com/ChristopherVR/ooxml/commit/85440e1b6a88608c297de91157648a057dda0102))
- **visio:** Add quick style and outer shadow format edits ([385f163](https://github.com/ChristopherVR/ooxml/commit/385f1635aa27b5f5fbfb591565b9ed599009efb2))
- **visio:** Insert pictures and edit shape links and screentips ([d17698c](https://github.com/ChristopherVR/ooxml/commit/d17698c6345dd5b873c0141e661c04ec07235cf9))
- **visio:** Add group-shapes and ungroup-shape edits ([1e905d7](https://github.com/ChristopherVR/ooxml/commit/1e905d7149631242ceb2909ca45b4701739d56a7))
- **visio:** Glue straight connectors to shapes with native dynamic glue ([e4970fa](https://github.com/ChristopherVR/ooxml/commit/e4970fa5cef4f8c6f3a131642e101a0141f4684d))
- **visio:** Add page setup, page properties and page decoration edits ([f473bd4](https://github.com/ChristopherVR/ooxml/commit/f473bd4804ade69b89e3b0aad9a5903c5735b680))
- **visio:** Keep auto size on standard sizes and match paper sizes ([5760f7b](https://github.com/ChristopherVR/ooxml/commit/5760f7ba03789026ccbb13dcd47e462c18053a55))
- **visio:** Add page themes and glow, soft edge and reflection effects ([709bd22](https://github.com/ChristopherVR/ooxml/commit/709bd2287e86a689eff8cb3b674f95f6da755d00))
- **visio:** Add comments, subprocess, diagram checks and shape reports ([6fc89d0](https://github.com/ChristopherVR/ooxml/commit/6fc89d019990be3baa2a71acac8fbe25a386f566))
- **visio:** Plan create new and create from selection subprocesses ([f52bbf1](https://github.com/ChristopherVR/ooxml/commit/f52bbf17e13df75a38c864d035d2d6ff594f92df))
- **visio:** Add stencil outlines, containers and callouts ([7a28511](https://github.com/ChristopherVR/ooxml/commit/7a28511f983a8c316968d8e01f5308894bc41118))
- **visio:** Edit shape data and save linked external data recordsets ([ca13e1d](https://github.com/ChristopherVR/ooxml/commit/ca13e1d184087b32cb03e8e5a727ec5fc0d362cf))
- **visio:** Add data import tables and data graphic edit planning ([350c37a](https://github.com/ChristopherVR/ooxml/commit/350c37a38e0a5809456aa02973d8ebfbb07c5030))
- **ui:** Enable the visio data tab with import, linking and data graphics ([fc88751](https://github.com/ChristopherVR/ooxml/commit/fc887514fc44310a895f4183fb903be415e951a6))
- **visio:** Add connection points, point glue and connector routes ([25c47f8](https://github.com/ChristopherVR/ooxml/commit/25c47f883bd89cdbe9f74799baea0ec0c9dee438))
- **visio:** Re-route glued connectors for move previews ([40e4dc5](https://github.com/ChristopherVR/ooxml/commit/40e4dc5d8276ae50531a872b86322bb0b9a47dc8))
- **visio:** Add re-layout, auto align, layer assignment and guide edits ([c4c9cb2](https://github.com/ChristopherVR/ooxml/commit/c4c9cb2dec0579c595fc0d6be0787fd1da4e8cd6))
- **visio:** Assign mixed layers in one transaction and paste text boxes ([3fedc6d](https://github.com/ChristopherVR/ooxml/commit/3fedc6dffe13ccaa1e6a100e33b90619b273ec23))
- **visio:** Add text dialog formatting, text block placement and text fields ([30f680b](https://github.com/ChristopherVR/ooxml/commit/30f680bacbb4783fdaddc62f25c6cfebc10b0f5d))
- **visio:** Add text dialog, text block and text draft helpers ([438a552](https://github.com/ChristopherVR/ooxml/commit/438a5529b051a601b7849b69fc3255e3d98ebd3d))

### Bug Fixes

- **visio:** Show one colour rule when every value is equal ([00bc35c](https://github.com/ChristopherVR/ooxml/commit/00bc35c94781e428bca99820aca216d7030cf73e))
- **pptx:** Save the size of empty table cell paragraphs ([5f73df1](https://github.com/ChristopherVR/ooxml/commit/5f73df19e7c77690d55cc1c33f1792d76d18851a))
- **visio:** Resolve code scanning alerts in connectors and links ([b370053](https://github.com/ChristopherVR/ooxml/commit/b370053ed6d6f96bb3ae9caeb84f3973a99ba9f8))

## [1.5.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.5.0) - 2026-10-09

### Features

- **visio:** Create every basic shapes outline ([10e2e82](https://github.com/ChristopherVR/ooxml/commit/10e2e825b041ff9dec6cf2555234f386c86ddfac))

### Bug Fixes

- **xlsx:** Clear stale filter row state ([#36](https://github.com/ChristopherVR/ooxml/issues/36)) ([158f6cc](https://github.com/ChristopherVR/ooxml/commit/158f6ccfb54b6965dedda325d2cc2df3adb187ef))

## [1.4.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.4.0) - 2026-10-08

### Features

- **visio:** Preserve rich replacements and set fixed page dimensions ([8882860](https://github.com/ChristopherVR/ooxml/commit/8882860df98992b16e6c0ac83666f7d69dab7bc8))

### Bug Fixes

- **ui:** Restore CI after the Visio find and replace changes ([f0ca01d](https://github.com/ChristopherVR/ooxml/commit/f0ca01d6618346cee74b723cfb9cb16f61eb1cb3))
- **xlsx:** Correct table, subtotal, save and sheet protection behavior ([#32](https://github.com/ChristopherVR/ooxml/issues/32)) ([af31ec6](https://github.com/ChristopherVR/ooxml/commit/af31ec670c229eabb8515e04bacf9f2c277ef053))
- **visio:** Resolve open code-scanning alerts ([a6bb188](https://github.com/ChristopherVR/ooxml/commit/a6bb188c4da9285a09589f6716b112aee82edb8b))

### Documentation

- Refresh the readmes with webp images and the office suite ([6a800d0](https://github.com/ChristopherVR/ooxml/commit/6a800d062bc911d6c4ea682bdbffa7fc437d1556))

## [1.3.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.3.0) - 2026-10-08

### Features

- **visio:** Enable source-backed formatting and shape ordering ([c39f7be](https://github.com/ChristopherVR/ooxml/commit/c39f7bee397d27afa31155a96c01997122402773))
- **visio:** Enable multi-selection formatting and arrangement ([fb70098](https://github.com/ChristopherVR/ooxml/commit/fb70098a2b100d6ec37cd091acd618c91477cfb2))
- **visio:** Enable rich formatting and source duplication ([d50e388](https://github.com/ChristopherVR/ooxml/commit/d50e388f9190809d6a860894663cdbf774ca4dca))
- **visio:** Format proven inherited text cells ([cbb4b20](https://github.com/ChristopherVR/ooxml/commit/cbb4b20c66effb2f2f019a6f9c5ec7f83fa07608))
- **visio:** Enable source-backed shape clipboard ([2c13c1f](https://github.com/ChristopherVR/ooxml/commit/2c13c1f39998cf37e83d3949a6685f84f4b16e4d))
- **visio:** Delete reference-closed shape selections ([d02ed0e](https://github.com/ChristopherVR/ooxml/commit/d02ed0ebb1f97622436ef0944838eaefed9f7127))
- **visio:** Create editable blank drawing packages ([4bcb713](https://github.com/ChristopherVR/ooxml/commit/4bcb71385e260240bbd03e1349fc4ff020327bd7))
- **visio:** Enable new drawings and pointer selection gestures ([75ac409](https://github.com/ChristopherVR/ooxml/commit/75ac409e5e67c23203c765d3aa472b6817853090))
- **visio:** Add source-proven anchored shape resizing ([cff07b8](https://github.com/ChristopherVR/ooxml/commit/cff07b8d9d7521819f2f4c3c514d77ca77d1638c))
- **visio:** Enable resize handles and size and position pane ([7601406](https://github.com/ChristopherVR/ooxml/commit/76014064de44defbf80208cd0fab1f33ef17c00b))
- **visio:** Add text boxes and preserve logical text paragraphs ([cbc47ff](https://github.com/ChristopherVR/ooxml/commit/cbc47ffc77cd8145c5e6b633a3dd87a105ed4072))
- **visio:** Add native paint patterns and transparency edits ([3a9ba13](https://github.com/ChristopherVR/ooxml/commit/3a9ba136f30d71b030af7cb86eecceed1ce49e3d))
- **visio:** Add scoped replacement plans and SVG hairlines ([79fb8e8](https://github.com/ChristopherVR/ooxml/commit/79fb8e8f6b572a3b7d53d8ba660626f7d49a7e9d))

### Bug Fixes

- **pptx:** Write cell properties into an empty a:tcPr ([22e8a3b](https://github.com/ChristopherVR/ooxml/commit/22e8a3b9661b4dada517df5d24d47e8eb3fa94e9))
- **xlsx:** Read formula sheet prefixes without a backtracking regex ([4a19c87](https://github.com/ChristopherVR/ooxml/commit/4a19c87ce84643af7af28e22abb7917c7efc9771))

## [1.2.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.2.1) - 2026-10-08

### Bug Fixes

- **pptx:** Keep unedited empty table cells free of a:tcPr ([01d4f3d](https://github.com/ChristopherVR/ooxml/commit/01d4f3d36d5acd4fb795b4f33018efa0e3482b06))
- **pptx:** Default an absent c:gapWidth to 150 ([e16f565](https://github.com/ChristopherVR/ooxml/commit/e16f5651541cfbba9b7a1280e58463c041e507d9))
- **xlsx:** Format selection statistics with the cell number format ([649f556](https://github.com/ChristopherVR/ooxml/commit/649f5568b348083aa548b2e819da02435d68d64a))
- **xlsx:** Make the formula number lexeme linear ([9b32d49](https://github.com/ChristopherVR/ooxml/commit/9b32d493d49dde1ba9002da056c4a24a8885af11))

### Performance

- **xlsx:** Prepare the formula graph incrementally ([15dc223](https://github.com/ChristopherVR/ooxml/commit/15dc22334dc6a5561817b24399a4cb0675dae3b4))
- **xlsx:** Shift the formula graph on row and column edits ([e3ef7d8](https://github.com/ChristopherVR/ooxml/commit/e3ef7d8bd7cb29d0c8cdcc6bf8dee29c07cace38))
- **xlsx:** Rename sheet references without rebuilding the graph ([57094bf](https://github.com/ChristopherVR/ooxml/commit/57094bfadb0831e52d08553f7927176c66062a68))
- **xlsx:** Cache formula templates for structural rewrites ([6d477d0](https://github.com/ChristopherVR/ooxml/commit/6d477d0023ceede31a50326f6fd3761bb8d97284))

### Refactor

- **pptx:** Share the chart XML presence check for a:noFill ([ad7bae0](https://github.com/ChristopherVR/ooxml/commit/ad7bae0ea91758a2e7dcb581c2f472da394e5eb4))

### Testing

- **xlsx:** Structural edits while the formula graph is prepared ([67e0de5](https://github.com/ChristopherVR/ooxml/commit/67e0de5f621a1fdb3149a7a261f0d33b9e4073f4))

### Chores

- **xlsx:** Profile structural edits ([b3330b4](https://github.com/ChristopherVR/ooxml/commit/b3330b419664f5fa7494bc1deada2ba8e25cc232))

## [1.2.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.2.0) - 2026-10-08

### Features

- **chart:** Add the neutral chartSpace model ([2544c31](https://github.com/ChristopherVR/ooxml/commit/2544c31319b5cc723b26a2c37b519719693f62b8))
- **chart:** Parse chart parts from the shared DOM ([49c1b76](https://github.com/ChristopherVR/ooxml/commit/49c1b76e41b5fac972c52a5d8169e9ad14478cfd))
- **docx:** Load chart parts into the document model ([01ce179](https://github.com/ChristopherVR/ooxml/commit/01ce17985b5d5bd0399497af6fe370ae99413a53))
- **opc:** Patch property parts in place and model app statistics ([66c4cf1](https://github.com/ChristopherVR/ooxml/commit/66c4cf1043d73a6df05131d813cbae7f5af6e35e))
- **xlsx:** Model and read sparkline groups ([681f241](https://github.com/ChristopherVR/ooxml/commit/681f2418a0300ffb19287b57928544f4e90b0a95))
- **xlsx:** Lay out sparklines for painting ([d95575a](https://github.com/ChristopherVR/ooxml/commit/d95575ab9d67bc0c96c33181262b3de232214493))
- **xlsx:** Add the Yjs workbook adapter ([6289494](https://github.com/ChristopherVR/ooxml/commit/628949485ba4f14ffda1f131cf6c8b44fc5596bf))
- **xlsx:** Bind edit sessions to shared workbooks ([cd28ab3](https://github.com/ChristopherVR/ooxml/commit/cd28ab35755790f149632bd2dae0ad2a37d5935d))
- **chart:** Write chartSpace parts from the neutral model ([bf6920f](https://github.com/ChristopherVR/ooxml/commit/bf6920fb553ff32c32c3edf9bff652cad3bd71ac))
- **chart:** Accept text bodies given as XML and drop invalid characters ([816830f](https://github.com/ChristopherVR/ooxml/commit/816830fa29a42491d72b835a9b6eb7b5a617f234))
- **xlsx:** Lay out remote selections ([3770bb8](https://github.com/ChristopherVR/ooxml/commit/3770bb85d8d7106fcf67c822533c189e5087e1c1))
- **xlsx:** Let the editor context own the undo history ([46641d7](https://github.com/ChristopherVR/ooxml/commit/46641d76777a94c25897c391c8066d3b057f8212))
- **chart:** Render chartSpace parts to svg ([eb2c12f](https://github.com/ChristopherVR/ooxml/commit/eb2c12f877c0f4c7521a9d71e323120fb9084ca6))
- **docx:** Draw charts in the editor and print layout ([da2ed18](https://github.com/ChristopherVR/ooxml/commit/da2ed1850715cf85d01ecc4f3967aa48d9414348))
- **chart:** Model display units, data tables and walls ([b95531a](https://github.com/ChristopherVR/ooxml/commit/b95531a3ff55f09c83676291c4b4857d1943189c))
- **opc:** Support shared suite files and embedded editing ([41614b1](https://github.com/ChristopherVR/ooxml/commit/41614b10ef62522fe2dceae695b478b53cca293a))

### Bug Fixes

- **pptx:** Keep pptx/ui in the relaxed project the bundlers read ([fb2a0d3](https://github.com/ChristopherVR/ooxml/commit/fb2a0d3224cc8d524baae359de5098003332ef0e))
- **chart:** Paint coincident linear stops as the native one-step ramp ([eabbc5e](https://github.com/ChristopherVR/ooxml/commit/eabbc5e3dc968f0d40246293238ef88ae7b004f4))
- **pptx:** List line breaks in slide titles as spaces in app.xml ([45f496a](https://github.com/ChristopherVR/ooxml/commit/45f496ab747f90f7b8764a295c8d0df8414141c0))
- **pptx:** Export the neutral SmartArt type names from the public entry ([0f081d2](https://github.com/ChristopherVR/ooxml/commit/0f081d260fbaf034129114fcba6137c900dbf846))
- **xlsx:** Report sparklines as shown in the feature notes ([1db5daa](https://github.com/ChristopherVR/ooxml/commit/1db5daacd00458cdd74e6913ea5b6c627bbe6543))
- **chart:** Read the line chart group's own c:smooth ([a5cfd0d](https://github.com/ChristopherVR/ooxml/commit/a5cfd0d45af11e2b2214a9abdc86ce33ba5312be))
- **pptx:** Read chart style numbers from the mc:Fallback ([045faf7](https://github.com/ChristopherVR/ooxml/commit/045faf71cadf05f1c9bc4b3155003abe9520b764))
- **pptx:** Treat a bare data-label switch as on ([637f938](https://github.com/ChristopherVR/ooxml/commit/637f938814baced0d2f72aeca7142e2281db0ca3))
- **pptx:** Declare c15 and c16 prefixes in chart extension writers ([7b93a01](https://github.com/ChristopherVR/ooxml/commit/7b93a010a77c1ef8433f75fc8d2f3ad810659c75))
- **pptx:** Repair chart parts this library once saved with undeclared prefixes ([a5f77af](https://github.com/ChristopherVR/ooxml/commit/a5f77af3bf0a2661af35091da920ca707e4fcb96))
- **xlsx:** Adopt the shared workbook before seeding a room ([3b3aa8e](https://github.com/ChristopherVR/ooxml/commit/3b3aa8e3e4b5d54c062b2d955b0f1008ee9cebc0))
- **pptx:** Build chart style palettes over the deck theme ([7ab9527](https://github.com/ChristopherVR/ooxml/commit/7ab9527743dbb1dc1438d2d3e6e73553b13e54b7))
- **pptx:** Read each table cell paragraph's own layout ([bcc61f3](https://github.com/ChristopherVR/ooxml/commit/bcc61f3b3e98564e50d018a4a37576f3b237fb57))
- **pptx:** Save each table cell paragraph's own alignment ([0d43f35](https://github.com/ChristopherVR/ooxml/commit/0d43f3530d5cefd52b98193be98329b4ec66547b))
- **pptx:** Align every paragraph when a table cell is aligned ([1bb7e7d](https://github.com/ChristopherVR/ooxml/commit/1bb7e7de568a0d8a6808862fd6dc4367782e9686))
- **pptx:** Skip chart axis lines and gridlines set to no line ([c6a9fcb](https://github.com/ChristopherVR/ooxml/commit/c6a9fcb0fb07498acf6db64d9ee9417339a6f2ac))
- **pptx:** Apply a table cell run's character spacing ([6d1ee14](https://github.com/ChristopherVR/ooxml/commit/6d1ee148cbd0ea058ae032a7a3b8fe9cdace1ce1))
- **pptx:** Size an empty table cell from its end paragraph properties ([30da656](https://github.com/ChristopherVR/ooxml/commit/30da656aa60039fff3c912c20cd286dc49055adf))
- **teams:** Bound the content pattern ([78dde2d](https://github.com/ChristopherVR/ooxml/commit/78dde2dbd5f7161febe60f1dcd84586fe7668b4d))
- **xlsx:** Guard chart series edits against prototype keys ([c49e00f](https://github.com/ChristopherVR/ooxml/commit/c49e00f90bc48b2443841bdfa5d21965175496a8))

### Performance

- **xml:** Add a lightweight reader for large plain fragments ([5e0318f](https://github.com/ChristopherVR/ooxml/commit/5e0318facba5e0766dd6d1f26172eb94177fe471))
- **xlsx:** Read worksheet cell data without building a DOM ([d5addd2](https://github.com/ChristopherVR/ooxml/commit/d5addd2352df2b2aead2920136ae38775663bec2))
- **xlsx:** Trust stored values on the first recalculation ([a584a55](https://github.com/ChristopherVR/ooxml/commit/a584a550628a9725f2a637a671883e28d8ca1dc3))
- **xlsx:** Tokenize formulas without slicing the source ([a7ec241](https://github.com/ChristopherVR/ooxml/commit/a7ec241ea393436f4c27d4e7024eef1878460c82))

### Refactor

- **pptx:** Compile the ui helpers under the strict project ([edbff0a](https://github.com/ChristopherVR/ooxml/commit/edbff0a3fd1863efa394da6c9fe826514fda5f7c))
- **visio:** Read the theme through drawingml ([5281182](https://github.com/ChristopherVR/ooxml/commit/528118204a9405f3e8f6dd216fb9d7bdd0c62f93))
- **chart:** Use the Drawing type names ([76bf49c](https://github.com/ChristopherVR/ooxml/commit/76bf49c0a96519816c79375eed1aa9ead84f8b10))
- **xlsx:** Use the Drawing type names ([ab6fc07](https://github.com/ChristopherVR/ooxml/commit/ab6fc07bbf978d27b4f3335676331016a2bf736d))
- **xlsx:** Build chart objects from the shared chart model ([d0a660e](https://github.com/ChristopherVR/ooxml/commit/d0a660e6e54d20ed788594476360cbe8b3db4b9e))
- **diagram:** Add the neutral SmartArt model types ([b8f4e74](https://github.com/ChristopherVR/ooxml/commit/b8f4e7406362570e085c701dd1e342d534fcc048))
- **geometry:** Move the preset shape evaluator out of pptx ([c670910](https://github.com/ChristopherVR/ooxml/commit/c670910349b7f6d6d02c335a551518265efde6a9))
- **diagram:** Move the layout engine out of pptx ([91767c0](https://github.com/ChristopherVR/ooxml/commit/91767c03d4ec9fb2225c47eddd0adc850f187022))
- **pptx:** Update document properties through opc/properties ([a295f6a](https://github.com/ChristopherVR/ooxml/commit/a295f6a2182eb344e6c9e9a6fe70ba5366268b9c))
- **diagram:** Port the dgm:choose walkers to ordered XML ([2dfc037](https://github.com/ChristopherVR/ooxml/commit/2dfc0371bb0d4b72e5a3ef4b4cb71bd1a5cb7f81))
- **diagram:** Move the SmartArt constraint solver into diagram ([bd91ad8](https://github.com/ChristopherVR/ooxml/commit/bd91ad884cf00947957b9620309c885df21d6985))
- **diagram:** Move the SmartArt interpreter model into diagram ([b24d320](https://github.com/ChristopherVR/ooxml/commit/b24d3200af42eda7c1d7fcc7dcf592202e2fc0f8))
- **xlsx:** Write new charts through the shared writer ([2f898a7](https://github.com/ChristopherVR/ooxml/commit/2f898a7c560b3141df55b3544691fe5deefc118f))
- **chart:** Move the svg painter into the chart area ([0f9169d](https://github.com/ChristopherVR/ooxml/commit/0f9169d11c5bf92342bc291fdb3f8ef8d84927c5))
- **pptx:** Build chart models from the neutral parser ([1e38985](https://github.com/ChristopherVR/ooxml/commit/1e389856ae308843d0d86c83b41f6a62284ef1d2))
- **pptx:** Delete the legacy object-tree chart parser ([b4f0f4f](https://github.com/ChristopherVR/ooxml/commit/b4f0f4f8af4b2eefe49749f5b3c1b1ee7492dba9))
- **diagram:** Move the SmartArt hierarchy arranger into diagram ([989744c](https://github.com/ChristopherVR/ooxml/commit/989744c5a2ed121eda9b2b11a37815e295c14740))
- **diagram:** Move the SmartArt layout interpreters into diagram ([3725b73](https://github.com/ChristopherVR/ooxml/commit/3725b7359b5d845012fa7b84b3cddc421446cfbd))

### Documentation

- Describe the xlsx collaboration adapter ([d17cef3](https://github.com/ChristopherVR/ooxml/commit/d17cef34d8cd04f46419dcaf9989a99688b7fecf))

### Testing

- **pptx:** Compare chart parts with the neutral parser on every deck ([58b16be](https://github.com/ChristopherVR/ooxml/commit/58b16be72bdcf27e291ff5b9bebc139db9cd3607))

### Chores

- **xlsx:** Add a load profiler script ([60650a6](https://github.com/ChristopherVR/ooxml/commit/60650a6add08555a3c475b39139d88f36b773aa9))
- **scripts:** Expand every wildcard in package smoke subpaths ([f240a06](https://github.com/ChristopherVR/ooxml/commit/f240a06302ce04102f52a4df11dae529009dbc3b))

## [1.1.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.1.0) - 2026-10-08

### Features

- **ui:** Enable proven visio group rotation interactions ([be9ca55](https://github.com/ChristopherVR/ooxml/commit/be9ca5586434432f1673d42f5a0a6560ace25d83))
- **docx:** Edit imported list instance starts ([fe839f1](https://github.com/ChristopherVR/ooxml/commit/fe839f108009479d89e105a74a25f4bd8bea6bff))
- **docx:** Track plain paragraph splits and joins ([0b11ba1](https://github.com/ChristopherVR/ooxml/commit/0b11ba1e3599cd082d68862010c4c2576a5b8410))
- **xlsx:** Render imported manual legend layouts ([5173750](https://github.com/ChristopherVR/ooxml/commit/5173750a97a560e50d408d3f2f39df6d162d78d5))

### Bug Fixes

- **docx:** Track complete simple field replacements ([e4a7ccd](https://github.com/ChristopherVR/ooxml/commit/e4a7ccdb6a0eea969ed9fc4b878d6114ed749425))
- **docx:** Preserve field lock and dirty state ([818d8cd](https://github.com/ChristopherVR/ooxml/commit/818d8cd2e0ff0f2ab14b7da49b211f296d43cec6))
- **docx:** Retain locked caches during field updates ([9cad7c9](https://github.com/ChristopherVR/ooxml/commit/9cad7c9b61fd76d900cef945f6766547e164e64e))
- **docx:** Repair complex field lock metadata after edits ([93b8b4e](https://github.com/ChristopherVR/ooxml/commit/93b8b4e9662c5aaf0bb7a94f599492d0441ffa93))
- **docx:** Exclude bookmarked tracked paragraph splits ([fcd6cb7](https://github.com/ChristopherVR/ooxml/commit/fcd6cb7caec0596511268f8f0799d518c9331cf1))

## [1.0.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@1.0.0) - 2026-10-07

### Features

- **xlsx:** Author chart series gradients with shared controls ([a932dbd](https://github.com/ChristopherVR/ooxml/commit/a932dbd724eb5bcf6f34473bd5e6f1fc80c07849))
- **docx:** Resolve inline object revisions in shared review ([af12a22](https://github.com/ChristopherVR/ooxml/commit/af12a22e52ce03c3ce48c1b2fd41d61a0fcce91b))
- **docx:** Resolve note revisions in document history ([bc485ab](https://github.com/ChristopherVR/ooxml/commit/bc485abfb662493b8efa31fd96653b92c0954ac0))
- **xlsx:** Edit gradient stop brightness with shared color logic ([a49baa4](https://github.com/ChristopherVR/ooxml/commit/a49baa4d275182dd89bb3bd61fd5b7c9e2e719db))
- **xlsx:** Add shared gradient direction gallery ([2fff312](https://github.com/ChristopherVR/ooxml/commit/2fff3122b914ed8421128393bdcd8d937b26116c))
- **visio:** Render saved linear gradient strokes ([376480f](https://github.com/ChristopherVR/ooxml/commit/376480f823d76dcc0e9b71ace28611b6b885e755))
- **docx:** Resolve tracked paragraph marks in shared review ([f953d21](https://github.com/ChristopherVR/ooxml/commit/f953d211fd7f883e9f1eecbedb11b43d2cfc4ad3))
- **xlsx:** Drag gradient stops with shared live previews ([03fe589](https://github.com/ChristopherVR/ooxml/commit/03fe589bf37ad48b8e879a4855047586ae2e105b))
- **docx:** Resolve header and footer revisions with the body ([1229478](https://github.com/ChristopherVR/ooxml/commit/12294785b225730cee6b75816bc5fec2fd7a1e11))
- **docx:** Resolve inline object formatting history ([9689395](https://github.com/ChristopherVR/ooxml/commit/9689395a265d78a0f472f4880b6191130d2a9b43))
- **docx:** Project prior inline object formatting ([73691b8](https://github.com/ChristopherVR/ooxml/commit/73691b88ba16cf53b10aaaf68696ecb1c95980e8))
- **visio:** Translate local straight lines through shared edits ([856a0e1](https://github.com/ChristopherVR/ooxml/commit/856a0e11344265832906831b5eaa236a5c4f1e80))
- **visio:** Delete local lines and honor endpoint locks ([92e9a2b](https://github.com/ChristopherVR/ooxml/commit/92e9a2b5be3890d97706e9660a1a867c4596cbbd))
- **docx:** Record inline object formatting in shared history ([5de353d](https://github.com/ChristopherVR/ooxml/commit/5de353df2cf0b61b921dd2fef0141485292db1d8))
- **xlsx:** Add native named gradient preset gallery ([47ec692](https://github.com/ChristopherVR/ooxml/commit/47ec69208803df71d035ba191653134ec475ff26))
- **docx:** Preserve hard-break formatting and shared history ([a4dfbc4](https://github.com/ChristopherVR/ooxml/commit/a4dfbc40088ad577195695092149bdd195d798f2))
- **visio:** Resize native local lines through the width cell ([cdb9b5f](https://github.com/ChristopherVR/ooxml/commit/cdb9b5f5e2f393de2e740489920e70bdc820f1c2))
- **docx:** Share font commands across text and inline objects ([469c0d4](https://github.com/ChristopherVR/ooxml/commit/469c0d4b8f9d3a43dbcb2ef907ce472c2ba8e5ad))
- **visio:** Edit native local line endpoints ([3822b31](https://github.com/ChristopherVR/ooxml/commit/3822b31f8a4a7b08945772200448ac2b296c1d02))
- **xlsx:** Add rectangular gradient geometry controls ([e10c21a](https://github.com/ChristopherVR/ooxml/commit/e10c21a08bf6fdc3238504d7434db3f0b2a8b68f))
- **visio:** Drag local line endpoints on the canvas ([f68d353](https://github.com/ChristopherVR/ooxml/commit/f68d35354731f13c283032d81d2d11aec9c4b783))
- **docx:** Merge independent inline properties in yjs ([988a721](https://github.com/ChristopherVR/ooxml/commit/988a721111607e6588b628de48745e5bfa1cef6b))
- **docx:** Preserve inline hyperlinks through shared commands ([d1e7bf0](https://github.com/ChristopherVR/ooxml/commit/d1e7bf05f53d7b84fa2b7da3aec4ea006f629b8f))
- **xlsx:** Author radial and path fills on chart series ([2d3652a](https://github.com/ChristopherVR/ooxml/commit/2d3652ad10b2422302dbe457bb6899f2e56cb7bb))
- **visio:** Create straight lines through shared drawing tools ([f67c10f](https://github.com/ChristopherVR/ooxml/commit/f67c10f3032f03e4c4b5b01f1caafe0395bb7af6))
- **docx:** Share independent inline comment anchors ([4397b4b](https://github.com/ChristopherVR/ooxml/commit/4397b4bf5629a7a9da21a34b286f01d2b0853136))
- **ui:** Refine shared files commands and sorting ([9372d61](https://github.com/ChristopherVR/ooxml/commit/9372d61fecf826888d184a48d3f3f1c063328174))
- **xlsx:** Format chart and plot background fills ([9237f7f](https://github.com/ChristopherVR/ooxml/commit/9237f7f2ec5851088a28d2af5ca82d02806f5438))
- **visio:** Create and resize native ellipses with shared logic ([6c4d008](https://github.com/ChristopherVR/ooxml/commit/6c4d00839469577dfff31a61e27150c7bd281c53))
- **xlsx:** Format and paint chart title and legend fills ([4255dcd](https://github.com/ChristopherVR/ooxml/commit/4255dcdee2fbf4c62ea9260ffcf3a9856ebb859b))
- **visio:** Rotate local shapes through shared editing ([c68e4f4](https://github.com/ChristopherVR/ooxml/commit/c68e4f471d9fdd2927bdb47a13c95b78c0bd706e))
- **visio:** Rotate shapes with shared pointer geometry ([407fa61](https://github.com/ChristopherVR/ooxml/commit/407fa614c7f919052d44d9e31f7abfbcfe6df50d))
- **visio:** Render live rotation previews through shared svg ([87c3957](https://github.com/ChristopherVR/ooxml/commit/87c3957b5967466db44cbc95b08f5cfff21d81a7))
- **visio:** Share native quarter-turn command preparation ([c342e79](https://github.com/ChristopherVR/ooxml/commit/c342e79b82930797a7bf3a16b89a3bbe86d0128e))
- **xlsx:** Render and preserve mixed chart title text ([4f3f87e](https://github.com/ChristopherVR/ooxml/commit/4f3f87ea6eff2802393f24448a1b48931282d012))
- **visio:** Flip local shapes through shared geometry edits ([cffd415](https://github.com/ChristopherVR/ooxml/commit/cffd415a9fd7a8866f3f07dae027850dccb17c82))
- **geometry:** Support proven visio flip formulas ([f4d411d](https://github.com/ChristopherVR/ooxml/commit/f4d411d1fc8b9c7fd6876f581e25c7aa979ed563))
- **xlsx:** Render and preserve chart title paragraph spacing ([4f0d619](https://github.com/ChristopherVR/ooxml/commit/4f0d6198d90ab3befbfa6b9806965f01492bce45))
- **geometry:** Reuse source proof for visio rotation ([5f90540](https://github.com/ChristopherVR/ooxml/commit/5f905400b9e364e7061c1d30d6b6a6318023df25))
- **xlsx:** Wrap chart titles with shared text flow ([14a33ed](https://github.com/ChristopherVR/ooxml/commit/14a33ed2ee58f8469e5d24a0a36923a3922f23c4))
- **docx:** Render native hexadecimal list labels ([a7cc8aa](https://github.com/ChristopherVR/ooxml/commit/a7cc8aac044b2ebc24294d1df6c3ae7d7893a406))
- **geometry:** Support proven local visio group rotation ([cd7e429](https://github.com/ChristopherVR/ooxml/commit/cd7e429a21f0e0d986ce2d6b6e6c0cced1afd1e8))

### Bug Fixes

- **visio:** Project oblique stroke gradients in physical bounds ([2a05f37](https://github.com/ChristopherVR/ooxml/commit/2a05f37fb9e7e2e7683d0566a2831cc0122360cf))
- **visio:** Project saved oblique fills through physical bounds ([938ceae](https://github.com/ChristopherVR/ooxml/commit/938ceae0aaa1a7db365f577f36550863757f3f8f))
- **visio:** Render gradients on height-zero line shapes ([2980419](https://github.com/ChristopherVR/ooxml/commit/2980419d1b67a0cf8fd00d4b1657fdb5a2aa89a4))
- **chart:** Match native scaled linear gradient paint ([8bd1171](https://github.com/ChristopherVR/ooxml/commit/8bd1171809210e886f9a459a5d634b2109ad06e9))
- **chart:** Paint native rectangular path gradients ([af81015](https://github.com/ChristopherVR/ooxml/commit/af81015bca6823dc505c26c006b2a99eb2e85c8f))
- **xlsx:** Paint native circular chart backgrounds ([e2bddbf](https://github.com/ChristopherVR/ooxml/commit/e2bddbfdafdfe31792ec9f9e6e5002350e5d2f4f))
- **docx:** Locate imported inline comment anchors ([7ecbe15](https://github.com/ChristopherVR/ooxml/commit/7ecbe15f2e9b25401316579ad35e855b5add6b90))
- **xlsx:** Preserve chart axis visibility on export ([da056bb](https://github.com/ChristopherVR/ooxml/commit/da056bb9ebbc70561d63b1dc9e1f558997c0f946))
- **xlsx:** Preserve direct chart fills on export ([c3b3491](https://github.com/ChristopherVR/ooxml/commit/c3b3491a109720a2e38599b3b5272e9d84964309))
- **visio:** Preserve drawn line endpoints beyond paper edges ([6cc3708](https://github.com/ChristopherVR/ooxml/commit/6cc37087579742326cacec4b8b670b869c1ad48f))
- **docx:** Anchor comments to complete complex fields ([065cb5c](https://github.com/ChristopherVR/ooxml/commit/065cb5c1c8554e9cdbe7b61a807d9efff1ffc2de))
- **visio:** Apply native drawing defaults to new rectangles ([13d6830](https://github.com/ChristopherVR/ooxml/commit/13d6830d08e9022e4d109777063b9de77b686a7b))
- **docx:** Undo comment records with their anchors ([c736fab](https://github.com/ChristopherVR/ooxml/commit/c736fabf6d76c7e5cf87f137745e7dc1ea21bdba))
- **docx:** Retain body edits during yjs settings updates ([62d3fbd](https://github.com/ChristopherVR/ooxml/commit/62d3fbd3a5b852cb78619f3006ec982e5bbc4230))
- **docx:** Retain complete simple field comment scopes ([30500ef](https://github.com/ChristopherVR/ooxml/commit/30500efc737d69b920530893bf4de24b629b1dd9))
- **visio:** Preserve drawn boxes beyond scaled paper edges ([0048416](https://github.com/ChristopherVR/ooxml/commit/0048416f0cca19f7d3888e4c71c1d1d09583792e))
- **docx:** Retain adjacent simple field boundaries ([9303f68](https://github.com/ChristopherVR/ooxml/commit/9303f68aab372012d833669aa4eb45ceffba7726))
- **docx:** Copy field results as formatted literal text ([797db1b](https://github.com/ChristopherVR/ooxml/commit/797db1ba8f8942b2b364833e6a065504486ceaac))
- **pptx:** Copy owned package parts when duplicating slides ([6940f93](https://github.com/ChristopherVR/ooxml/commit/6940f936cc1f804a498aea941480357ad4236edb))
- **pptx:** Generate complete native 3d chart axes ([6de35d9](https://github.com/ChristopherVR/ooxml/commit/6de35d96c68b4c7a6118b7bcb2a9ac27fa7f3ecc))
- **pptx:** Write text properties before paragraph content ([a5fe6e7](https://github.com/ChristopherVR/ooxml/commit/a5fe6e78fe4889804f4a553dcbf4ce4a1c6c92e4))
- **docx:** Retain simple fields during result replacements ([908c45e](https://github.com/ChristopherVR/ooxml/commit/908c45ea9da8bf6ca75b7a4faefab87db44711d4))
- **xlsx:** Preserve native built-in chart text defaults ([f3b9335](https://github.com/ChristopherVR/ooxml/commit/f3b93358bc0fd123c1eb83cfba9237e183ae31e6))
- **docx:** Preserve empty fields through deletion and review ([e3c06a7](https://github.com/ChristopherVR/ooxml/commit/e3c06a73632b21645ff6553ed85d5426bfe49e53))
- **docx:** Share field-aware deletion across clipboard paths ([408ecb8](https://github.com/ChristopherVR/ooxml/commit/408ecb8a12549b953777c3037074280110ddd017))
- **xlsx:** Inherit and preserve chart text formatting ([b292d16](https://github.com/ChristopherVR/ooxml/commit/b292d167b07c6cebaa9168f7a01ab113135d3857))
- **visio:** Preserve protected angles during flips ([48c9156](https://github.com/ChristopherVR/ooxml/commit/48c91568f14905441b152cefaea3b8486f99f86f))
- **xlsx:** Measure chart title and legend text in the browser ([e74cf9e](https://github.com/ChristopherVR/ooxml/commit/e74cf9e85fec51ee29fee5c2ad9f892c38a1c12f))
- **visio:** Retain guarded flip flags in native transforms ([ed7c987](https://github.com/ChristopherVR/ooxml/commit/ed7c98774e3e30292348c536b222e89c64bb408b))
- **xlsx:** Align chart title lines with measured font boxes ([8499a58](https://github.com/ChristopherVR/ooxml/commit/8499a584ea11a03cb25517f3d6dad3b16104b375))
- **ui:** Preserve feedback and history for blocked visio flips ([9feb751](https://github.com/ChristopherVR/ooxml/commit/9feb75113d0e0d3f01bf509bbe55d08ee46af7ce))
- **docx:** Remove incomplete field structure from clipboard ([1539bbc](https://github.com/ChristopherVR/ooxml/commit/1539bbc9a136a904aad1e3b73f59834ac195ccd8))
- **docx:** Preserve explicitly empty simple field caches ([a96867f](https://github.com/ChristopherVR/ooxml/commit/a96867f4d784d723812a5e2cf13a1eec8b343acf))
- **docx:** Preserve fields when deleting final graphemes ([8288b60](https://github.com/ChristopherVR/ooxml/commit/8288b605b3eb4358cc803ea05457946443174f6f))
- **docx:** Retain nested field result metadata ([768a5b5](https://github.com/ChristopherVR/ooxml/commit/768a5b580e814d7884211987fffadc3cf4353286))
- **docx:** Resolve logical alignment after direction overrides ([2cc0ae5](https://github.com/ChristopherVR/ooxml/commit/2cc0ae57f42a503b39c9b60cd5c63d8ddd901929))
- **docx:** Decode packed table look flags ([dbef394](https://github.com/ChristopherVR/ooxml/commit/dbef3940b521a5b6f37c40573e9b1528aba9d088))
- **docx:** Preserve field results across story paragraphs ([3b0cd9c](https://github.com/ChristopherVR/ooxml/commit/3b0cd9c2a526ea645cb7dfff56244b220c35549e))
- **docx:** Honor explicit off header and footer flags ([6fda7a3](https://github.com/ChristopherVR/ooxml/commit/6fda7a38d34343730821ebb8f81a4232f02fef44))
- **docx:** Project copied field result objects as literals ([dff5d16](https://github.com/ChristopherVR/ooxml/commit/dff5d168240dac773478dba6bc86dd3758c94a03))
- **docx:** Follow word numbering override restart rules ([a5f4daf](https://github.com/ChristopherVR/ooxml/commit/a5f4daf04f62b6ea81682c65ae9f975a766db3c8))
- **ci:** Exclude core test support from published declarations ([11666e6](https://github.com/ChristopherVR/ooxml/commit/11666e65e2f9dc9f02f31add14fea70c8e29a51c))
- **docx:** Preserve and resolve omitted numbering starts ([cde7d37](https://github.com/ChristopherVR/ooxml/commit/cde7d37fac28063ef233550feed3786bc1eadcd8))
- **ci:** Clear lint errors in chart and drawing checks ([f331e67](https://github.com/ChristopherVR/ooxml/commit/f331e670ca9c52a76e048648e55d0660d925f7c4))
- **pptx:** Preserve rectangular chart gradient paths ([27c6ddb](https://github.com/ChristopherVR/ooxml/commit/27c6ddbf0b123266a67c794b4bbaa0b7c0d062ef))

### Performance

- **pptx:** Share the engine and load metafile conversion lazily ([e00b1d7](https://github.com/ChristopherVR/ooxml/commit/e00b1d748b9adb79dac8579f67db24e75f0a7fe2))

### Testing

- **visio:** Measure rotated gradients in native raster frames ([e47981c](https://github.com/ChristopherVR/ooxml/commit/e47981c88dfb7d2c689c82e2c7c99d9232bc29c9))
- **visio:** Capture native line translation formulas ([79c274d](https://github.com/ChristopherVR/ooxml/commit/79c274d7ccd6c263a50ad464737739368de9ca62))
- **xlsx:** Measure native linear gradient paint profiles ([ccc4ceb](https://github.com/ChristopherVR/ooxml/commit/ccc4cebc6408a47f73e85ce95262ebe61973deda))
- **visio:** Verify endpoint edits across native drawing scales ([6f02467](https://github.com/ChristopherVR/ooxml/commit/6f02467063663351dbd73d84d125d9571e8dbf11))
- **visio:** Verify native endpoint gradient paint after saving ([be42b4d](https://github.com/ChristopherVR/ooxml/commit/be42b4d75e80266c63fa9e34ec46d42b7de50f43))
- **visio:** Verify native gradient paint after endpoint gestures ([c5d868d](https://github.com/ChristopherVR/ooxml/commit/c5d868dbcc432a2c219fd210a8d8c0355e17e039))
- **visio:** Record native endpoints after width overrides ([c699b54](https://github.com/ChristopherVR/ooxml/commit/c699b549a2fc4d7cb1fa57b257cf5efc1a919bb1))
- **visio:** Remove unused group rotation import ([906e7ef](https://github.com/ChristopherVR/ooxml/commit/906e7efa554bc964242ac441803a257c2ffb97e7))

## [0.24.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.24.0) - 2026-10-07

### Features

- **teams:** Add embedded content previews ([c127224](https://github.com/ChristopherVR/ooxml/commit/c127224861720dd2d37e24390f940e642588b559))
- **collab:** Add recovery actions and fix provider sync state ([828e686](https://github.com/ChristopherVR/ooxml/commit/828e6862c086f33a5d62025618cfd5f9d5fc3ce1))
- **xlsx:** Calculate native-compatible amorlinc depreciation ([d86855d](https://github.com/ChristopherVR/ooxml/commit/d86855dc7cfac049c5012306a32e7ed0750cc8e9))
- **xlsx:** Repeat copied blocks across selected paste ranges ([ac0ce3d](https://github.com/ChristopherVR/ooxml/commit/ac0ce3dd50810162fb71b285ecd1cf3e90f3138a))
- **teams:** Add shared tabs and workbook save copies ([35d637a](https://github.com/ChristopherVR/ooxml/commit/35d637acf7cebeb1453d02bd4ac792690b5ae2c0))
- **visio:** Render native-sized open arrowheads ([aca53b5](https://github.com/ChristopherVR/ooxml/commit/aca53b5ab43e771b39ed3d4f2b07adc6163a1c7f))
- **visio:** Render native curved open arrowheads ([4576cf7](https://github.com/ChristopherVR/ooxml/commit/4576cf75cef7b031ae3b44b82b0ffc85ed8a7272))
- **xlsx:** Support combined paste special options ([725d97e](https://github.com/ChristopherVR/ooxml/commit/725d97e0dd0e3759813dead0a2cd12ee0f99ee35))
- **xlsx:** Support whole-axis and relative r1c1 references ([30186f7](https://github.com/ChristopherVR/ooxml/commit/30186f70e030246fc8c8110581acad2fbc132f01))
- **teams:** Create and upload channel workbooks ([caa8442](https://github.com/ChristopherVR/ooxml/commit/caa8442b4f76171c9a763999e44e58dec545ebe8))
- **visio:** Match native filled arrows on straight connectors ([e4a4c57](https://github.com/ChristopherVR/ooxml/commit/e4a4c57973c025cb79764d4cb41fac152c69bc8e))
- **xlsx:** Implement native paste arithmetic operations ([bc9f9ef](https://github.com/ChristopherVR/ooxml/commit/bc9f9efa06b439fd1a216d5de9040f0c19aae24d))
- **xlsx:** Support all except borders paste ([025bf20](https://github.com/ChristopherVR/ooxml/commit/025bf20f7f85140186c766006a4db25880828fda))
- **xlsx:** Implement column widths paste ([03cfd50](https://github.com/ChristopherVR/ooxml/commit/03cfd5047fcbcf8500e0662b6bab3b432b1f5d03))
- **pptx:** Migrate shared renderer and editing into core and ui ([ba4cd0d](https://github.com/ChristopherVR/ooxml/commit/ba4cd0dc64707ed32d4386c14b80b0ad8a50300a))
- **xlsx:** Paste notes and validation rules ([eb51374](https://github.com/ChristopherVR/ooxml/commit/eb51374e6d7ed77a057bcc3274d7ef0bd6b936ee))
- **teams:** Cancel file transfers and report batch progress ([9147775](https://github.com/ChristopherVR/ooxml/commit/9147775d34bc2018fd56d7c039c8762c6fa5bf7f))
- **visio:** Insert source-backed pages with native reopen checks ([d6ccef6](https://github.com/ChristopherVR/ooxml/commit/d6ccef697508fe11e8ef79bc12e1f70f8a211bd1))
- **xlsx:** Preserve hyperlinks through clipboard operations ([1b7b5cc](https://github.com/ChristopherVR/ooxml/commit/1b7b5cc90a9b4863b5d150c8cf965f2e5c543cd6))
- **collab:** Support raw binary asset payloads ([c3e4dd3](https://github.com/ChristopherVR/ooxml/commit/c3e4dd343c65f15335dbee48d34c0c5524084b36))
- **docx:** Add shared Yjs editor collaboration ([af0ec8e](https://github.com/ChristopherVR/ooxml/commit/af0ec8e5a7d47a31433f1c33943de9ae51144b61))
- **visio:** Reorder pages with stable selection and history ([935f3cb](https://github.com/ChristopherVR/ooxml/commit/935f3cbe213c83f6ae44730dc7ff01119dfdf561))
- **docx:** Flow continuous sections on a shared page ([1909ef3](https://github.com/ChristopherVR/ooxml/commit/1909ef3b5e4935bd8ff9bbba63b83b191efff92f))
- **teams:** Render markdown tables and task lists ([d3e9827](https://github.com/ChristopherVR/ooxml/commit/d3e9827b562cb7c5824361080468484ce20b1bf4))
- **docx:** Balance columns before continuous section breaks ([b0343f4](https://github.com/ChristopherVR/ooxml/commit/b0343f441fbaa6b211b02a712ad1c81ab983ed29))
- **visio:** Refresh numeric page caches after page edits ([48ae105](https://github.com/ChristopherVR/ooxml/commit/48ae10578221707cefcf9e42c1b0596b500a424a))
- **xlsx:** Preserve conditional formats through clipboard operations ([91a856a](https://github.com/ChristopherVR/ooxml/commit/91a856ae3137b960472d0df713ddb95258c85af7))
- **teams:** Add focused channel thread conversations ([e260cca](https://github.com/ChristopherVR/ooxml/commit/e260ccac17474e7325546f71f06fab74e9474e80))
- **visio:** Rename pages with references and shared dialog ([a3154d0](https://github.com/ChristopherVR/ooxml/commit/a3154d0045a39c89c9d8f77020fb06ba0e393956))
- **teams:** Add personal followed thread navigation ([e19b0c1](https://github.com/ChristopherVR/ooxml/commit/e19b0c1d466c661d28c0d59fdb5dfbe50d95fc92))
- **xlsx:** Preserve linked data-bar settings during paste ([cc3bacc](https://github.com/ChristopherVR/ooxml/commit/cc3bacc1b7bb0a50bad494a5fafc63d61855a042))
- **teams:** Track unread followed thread activity ([711fed5](https://github.com/ChristopherVR/ooxml/commit/711fed5ba0e4fb5b29112e3aa65243a3d03eca11))
- **teams:** Automatically follow authored threads ([80b1f85](https://github.com/ChristopherVR/ooxml/commit/80b1f85459a9d5b653ac587702235adef02eed86))
- **xlsx:** Render linked data-bar appearance settings ([859552f](https://github.com/ChristopherVR/ooxml/commit/859552fb68dc3be9a2f84fde914f17f8c72a7078))
- **visio:** Delete pages with native cache and background handling ([e536c35](https://github.com/ChristopherVR/ooxml/commit/e536c3553ad87ccc4e35a1d2212ab65bb22e821f))
- **docx:** Synchronize comment threads through Yjs ([817c1cc](https://github.com/ChristopherVR/ooxml/commit/817c1ccbe3116aedb41cd4b41013ed8fff3064a2))
- **docx:** Balance unequal columns before continuous breaks ([af193f3](https://github.com/ChristopherVR/ooxml/commit/af193f3a3fc9650c6dff3ba5d43f4b0f027c2387))
- **pptx:** Move snapshots and cached drawing bounds into core ([f13d837](https://github.com/ChristopherVR/ooxml/commit/f13d83743ce937b5b8c5c66d0abc130d78da8dbb))
- **teams:** Preserve personal message drafts across views ([3287056](https://github.com/ChristopherVR/ooxml/commit/328705692aad1cd99a9427a0823564d703e33011))
- **xlsx:** Calculate data-bar axes and signed lengths ([42cc6e7](https://github.com/ChristopherVR/ooxml/commit/42cc6e777d77c55318105d7cf51f6b730e855e43))
- **docx:** Balance kept table rows before continuous breaks ([c9926dc](https://github.com/ChristopherVR/ooxml/commit/c9926dcb054e7e23c5b3dc2ed7866e02a326c5fc))
- **docx:** Balance split rows and repeated table headers ([d5a5cd7](https://github.com/ChristopherVR/ooxml/commit/d5a5cd73f739ea57cff5645a517725a04b17a47e))
- **teams:** Recover and cancel chat attachment transfers ([36332c2](https://github.com/ChristopherVR/ooxml/commit/36332c23480f95d87a093d3cde906ff405ff8019))
- **xlsx:** Honor advanced data-bar length percentages ([645b3b6](https://github.com/ChristopherVR/ooxml/commit/645b3b61f24d79e988e7f062c9a5bf664ba0d6da))
- **docx:** Synchronize track changes recording ([2e49393](https://github.com/ChristopherVR/ooxml/commit/2e493931f821785829127c69cd133b9b360db680))
- **visio:** Apply native layer colors and classic linear fills ([72743c2](https://github.com/ChristopherVR/ooxml/commit/72743c20f450be8c3b9c3ed9fe2741dd554a3f89))
- **docx:** Share revision recording and resolution ([26c54cd](https://github.com/ChristopherVR/ooxml/commit/26c54cd5db2c8ed69547540ed4448c979357cde4))
- **xlsx:** Reuse shared chart gallery and edit grouping ([9dc95e9](https://github.com/ChristopherVR/ooxml/commit/9dc95e9f5797ba62f0ce0cf929dbd88a941ad2ac))
- **teams:** Organize settings and save personal appearance ([c31c15c](https://github.com/ChristopherVR/ooxml/commit/c31c15c8e7e7ef99b99ef8757dcafd491316aef2))
- **visio:** Render native hatch fill tiles ([1bf7486](https://github.com/ChristopherVR/ooxml/commit/1bf7486161cb286f15ec0775bae7aa1cad1124d8))
- **docx:** Restore prior run properties on revision rejection ([9427440](https://github.com/ChristopherVR/ooxml/commit/94274409912976a358179ee79a16e3c5da9f88dc))
- **chart:** Share Office chart color palettes ([bd436dd](https://github.com/ChristopherVR/ooxml/commit/bd436dd9dc392805f84a2c483c67f09e424b2e5d))
- **docx:** Resolve imported formatting in shared review commands ([5ced959](https://github.com/ChristopherVR/ooxml/commit/5ced9591c6687df7e4c1d9773eedd855212bb328))
- **teams:** Save chat density and flush posts before navigation ([fb4284a](https://github.com/ChristopherVR/ooxml/commit/fb4284a237f54ea03c498bbff2854742122cceb5))
- **docx:** Restore prior paragraph formatting on rejection ([4612ec0](https://github.com/ChristopherVR/ooxml/commit/4612ec06e7a5e5fa70cefb51e285a8113da5e5a0))
- **docx:** Resolve paragraph formatting in shared review commands ([0221310](https://github.com/ChristopherVR/ooxml/commit/02213106c5aa9d17fb48c2b247032b15b2ccaf1d))
- **visio:** Preserve page hatch orientation and tile phase ([8b13665](https://github.com/ChristopherVR/ooxml/commit/8b13665ad715f703a983938b47c6b82ba87a6aee))
- **docx:** Resolve revisions across document stories ([3f512c0](https://github.com/ChristopherVR/ooxml/commit/3f512c04f7b8021e616a78b3662f9f518ae72691))
- **xlsx:** Add shared Change Colors gallery and native palette edits ([c0e42f0](https://github.com/ChristopherVR/ooxml/commit/c0e42f0b611371ffef7334fa950db5ce9a98cbdd))
- **docx:** Preserve script-specific fonts through tracked edits ([a698c3a](https://github.com/ChristopherVR/ooxml/commit/a698c3a85e60d6c0bf554ec2eb10d16096caee98))
- **visio:** Render native classic radial fills ([e26a6f5](https://github.com/ChristopherVR/ooxml/commit/e26a6f5e7464f3f37b940e36137e13531be55c7b))
- **docx:** Preserve overlapping text and formatting revisions ([88582ed](https://github.com/ChristopherVR/ooxml/commit/88582ed132cd20ef1620f1b3c59904e8650eb34c))
- **visio:** Render native classic region gradients ([92b9251](https://github.com/ChristopherVR/ooxml/commit/92b92518ac72d67630cc961882a0eb64349f4aa5))
- **chart:** Share native chart style definitions ([f8a6c9e](https://github.com/ChristopherVR/ooxml/commit/f8a6c9eecc12432d91de025b355f8ab1e1e1a673))
- **visio:** Normalize native saved vertical gradients ([326a7c4](https://github.com/ChristopherVR/ooxml/commit/326a7c4ab42a5740e4cd0f819233b27295254b46))
- **docx:** Retain opaque run properties through tracked text splits ([52d5e2a](https://github.com/ChristopherVR/ooxml/commit/52d5e2a80770f4e6de7f567ab15d7a7890c719bf))
- **visio:** Render saved oblique gradients in bounding boxes ([7194727](https://github.com/ChristopherVR/ooxml/commit/71947272d8d617a2c6ee21c6e76cda9861492c91))
- **xlsx:** Render imported native chart appearance ([c14f42d](https://github.com/ChristopherVR/ooxml/commit/c14f42d99db1aad93ff522a4436aab29606d52d6))
- **docx:** Record run formatting in shared track changes ([6536756](https://github.com/ChristopherVR/ooxml/commit/653675636cfab8f927f76f9fb242d83f9eba5558))
- **docx:** Honor formatting and move recording preferences ([98cb8e3](https://github.com/ChristopherVR/ooxml/commit/98cb8e365a792352a2123a52d57ad6fc5bdcfb1a))
- **teams:** Connect shared tabs to channel conversations ([9797022](https://github.com/ChristopherVR/ooxml/commit/9797022a4fb908b6ef1df57e29901eb53d9cc5ac))
- **visio:** Normalize saved radial fill presets ([9e8a56c](https://github.com/ChristopherVR/ooxml/commit/9e8a56c14b9f7f7a4fbc84448d657e75286c5bd3))
- **visio:** Reuse classic paint for saved rectangular gradients ([a85cb5c](https://github.com/ChristopherVR/ooxml/commit/a85cb5c72c45e29a027c53f0799598b562326024))
- **xlsx:** Preserve and render native chart series gradients ([50a9288](https://github.com/ChristopherVR/ooxml/commit/50a928804960c1ab373498a78ef3aab66ff5fbca))
- **docx:** Retain paragraph property bases through review edits ([af2b24c](https://github.com/ChristopherVR/ooxml/commit/af2b24cfca36df8da11de71d9b6a62f0a76ba0de))
- **docx:** Record paragraph formatting in shared track changes ([bddb5f9](https://github.com/ChristopherVR/ooxml/commit/bddb5f9f91a9555121b5a3361721caabf10cf800))
- **xlsx:** Render imported native chart shadows ([ab83de0](https://github.com/ChristopherVR/ooxml/commit/ab83de0bc39002955cf915922d4b027f13da760e))
- **docx:** Expose shared review recording preferences in a dialog ([ea73e60](https://github.com/ChristopherVR/ooxml/commit/ea73e603f0f791c183101c2b7be8e4347c066f1a))
- **teams:** Create channels through an in-app dialog ([65bc42f](https://github.com/ChristopherVR/ooxml/commit/65bc42fc7d5214784222e20db655c8cf872f1c39))
- **xlsx:** Honor native chart gap width and overlap ([42b7d63](https://github.com/ChristopherVR/ooxml/commit/42b7d63d9bd025ca0113b6f84c9f22ea37a986ab))
- **docx:** Project prior paragraph formatting in original review ([c7260b8](https://github.com/ChristopherVR/ooxml/commit/c7260b8d5330a7e1a8e0e851674b44bce5ce85bd))
- **xlsx:** Add docked chart series spacing controls ([19ef348](https://github.com/ChristopherVR/ooxml/commit/19ef348e76d5046170edd9e50bb496dbd094207f))
- **docx:** Project prior formatting in original print layout ([582b4da](https://github.com/ChristopherVR/ooxml/commit/582b4da5fdeadcbe1d50845e20055905be6edd56))
- **docx:** Honor review text visibility in paginated layout ([7b3fe73](https://github.com/ChristopherVR/ooxml/commit/7b3fe735269caa92795129b66caa8aa748f32c65))
- **xlsx:** Edit individual chart series fills ([94c1f0f](https://github.com/ChristopherVR/ooxml/commit/94c1f0f820d6c01b055f5c37b4c63a740fa56ea1))
- **xlsx:** Add solid chart fill transparency controls ([60f5c51](https://github.com/ChristopherVR/ooxml/commit/60f5c51fcc46e8edd48d0a25c9189113d7e799b1))
- **visio:** Render saved path fills with shared gradient paints ([e0b7ee9](https://github.com/ChristopherVR/ooxml/commit/e0b7ee9953329306029d2d584562267fdd59222e))

### Bug Fixes

- **visio:** Match native short connector rounding ([862a717](https://github.com/ChristopherVR/ooxml/commit/862a71733d7b2015589ea25df07c6a9a4e2afc49))
- **docx:** Honor contiguous table header rows ([2a838e8](https://github.com/ChristopherVR/ooxml/commit/2a838e8868b5479748162fc7b510e2b80418f388))
- **xlsx:** Preserve copied blanks and repeat directional fills ([6fc8f8d](https://github.com/ChristopherVR/ooxml/commit/6fc8f8df2275936c3c62ee6ea8317a9b463e5848))
- **xlsx:** Find trailing blanks in lookup reference ranges ([41dfd46](https://github.com/ChristopherVR/ooxml/commit/41dfd46cbaf6752cc13030feff0bb547e5e70f0d))
- **xlsx:** Reject scalar classic lookup arrays ([93950e2](https://github.com/ChristopherVR/ooxml/commit/93950e259c045c795836bf885a02c245d24745e6))
- **xlsx:** Match native fractional declining depreciation ([fd96914](https://github.com/ChristopherVR/ooxml/commit/fd9691400a7c69ec4be3c5e9dc53f7cde889742a))
- **xlsx:** Order mixed types in approximate lookups ([c666f2e](https://github.com/ChristopherVR/ooxml/commit/c666f2ee933be0b0be83a0ef4e3e094c1620fe61))
- **xlsx:** Match binary lookup duplicates and blank tails ([9a65bc9](https://github.com/ChristopherVR/ooxml/commit/9a65bc969e0a08a0df344936c5564ea1eb2dc027))
- **xlsx:** Distinguish omitted lookup search modes from blanks ([4756dbd](https://github.com/ChristopherVR/ooxml/commit/4756dbd1f753457b6dc030c0e05fc6d8242c744b))
- **xlsx:** Honor native reference argument omission rules ([8323315](https://github.com/ChristopherVR/ooxml/commit/8323315715c5782189c526f638b81ded288ef6c6))
- **xlsx:** Distinguish omitted offset dimensions from blank cells ([e198528](https://github.com/ChristopherVR/ooxml/commit/e1985287106ebebf08326aa39963137f023bd782))
- **xlsx:** Copy cells in every ribbon fill direction ([02adfb6](https://github.com/ChristopherVR/ooxml/commit/02adfb64a83f9149c5283dc81ca3d0c75ce0386f))
- **visio:** Match native short end-arrow stems ([3219c3f](https://github.com/ChristopherVR/ooxml/commit/3219c3fb03b21c4d1645d0e02887c8d6c7e0812b))
- **pptx:** Wrap text in static svg exports ([ece906e](https://github.com/ChristopherVR/ooxml/commit/ece906e50e8e19d41b062453ed0f898ea18abf77))
- **visio:** Normalize drawing scales to physical page inches ([0c320b5](https://github.com/ChristopherVR/ooxml/commit/0c320b50d6edda5ce6d9a7ccba4e1c300a06833b))
- **visio:** Preserve independent font lookups during edits ([6e27506](https://github.com/ChristopherVR/ooxml/commit/6e27506e999c1ad660203e19f15583b6375af4e4))
- **ci:** Resolve core PowerPoint self imports from source ([49f7f53](https://github.com/ChristopherVR/ooxml/commit/49f7f5326aa375a5078cc6ef7f600f6793e9195c))
- **pptx:** Preserve rich data label formatting when saving ([0cc1c69](https://github.com/ChristopherVR/ooxml/commit/0cc1c694ff9df5c5b88ce165f1d5602e29dd0da0))
- **docx:** Retain page field restarts across continuous sections ([04cce34](https://github.com/ChristopherVR/ooxml/commit/04cce34d7d6ce56deffffb05f124169e207344bb))
- **docx:** Retain concurrent overlapping comment anchors ([b131720](https://github.com/ChristopherVR/ooxml/commit/b131720f41a19dc4f4ba1145a857bd8e428b48f6))
- **docx:** Prevent stalled flow for oversized table lines ([63534e4](https://github.com/ChristopherVR/ooxml/commit/63534e4bb1fc41392b14451c2c44268aa40797a7))
- **docx:** Export linked moves that native word can open ([3fda2d2](https://github.com/ChristopherVR/ooxml/commit/3fda2d2d9fe2af970aff28c76fdb96089db637a2))
- **docx:** Timestamp recorded text revisions ([d657580](https://github.com/ChristopherVR/ooxml/commit/d6575805a22a7e02172aab674299e2e43953474a))
- **docx:** Preserve tracked run formatting through text edits ([ecfde3c](https://github.com/ChristopherVR/ooxml/commit/ecfde3c526ce16a41246f1ec26b22fe0a1921463))
- **ci:** Remove unsafe optional assertions from revision tests ([db594cb](https://github.com/ChristopherVR/ooxml/commit/db594cbe002c8b6a7ca1a99a7060c30fd24575a8))
- **docx:** Preserve paragraph revision snapshots through text edits ([30d586d](https://github.com/ChristopherVR/ooxml/commit/30d586d1893090538aa45dfe8bc1f42652638071))
- **docx:** Preserve pending revisions when reject all fails ([4f178ac](https://github.com/ChristopherVR/ooxml/commit/4f178ac64fd666e5b66b66c3180db513a9009a9a))
- **pptx:** Resolve chart text fonts across runs and scripts ([6d00580](https://github.com/ChristopherVR/ooxml/commit/6d00580398c698e2cf4140ed2f709883b29f475d))
- **pptx:** Include bullet text runs in paragraph strut sizing ([b10c8cd](https://github.com/ChristopherVR/ooxml/commit/b10c8cd89ae3ed4ee87cf1a38f7892928858bac1))
- **pptx:** Wrap Korean text at word boundaries ([cfa6b1d](https://github.com/ChristopherVR/ooxml/commit/cfa6b1d9d27b43685b6b5e1a6ef7cf7a63a73229))
- **docx:** Honor style page breaks and invalidate cached markers ([64d02c8](https://github.com/ChristopherVR/ooxml/commit/64d02c86d2205380c969fc4be3d06476901f9c65))
- **visio:** Report native gradient raster fidelity gaps ([f30a2e4](https://github.com/ChristopherVR/ooxml/commit/f30a2e42f3f3fe8f815c86cd88dc7ce028ddb0ce))
- **visio:** Reproduce native opaque gradient paint ([d6930d8](https://github.com/ChristopherVR/ooxml/commit/d6930d87fe0a3d8ddced21d66094e6d63776d042))
- **visio:** Remove transparent region fill seams ([562e07e](https://github.com/ChristopherVR/ooxml/commit/562e07e8bf41be7b23e3c27e6166c98af0a2a830))
- **docx:** Preserve and filter inline object revisions ([0125d83](https://github.com/ChristopherVR/ooxml/commit/0125d83a8fe243f663c6867d76e7ffd79390d3cc))

### Refactor

- **pptx:** Move chart grid editing policy into core ([0d8e23f](https://github.com/ChristopherVR/ooxml/commit/0d8e23f8cf62ed11d01d9ab0417df12d23b9b213))
- **docx:** Share comment editing commands in core ([51ad69c](https://github.com/ChristopherVR/ooxml/commit/51ad69ccd3b61e2472bbee40fda65b3eaed43e3c))
- **crypto:** Share Office GUID generation ([7d4ceeb](https://github.com/ChristopherVR/ooxml/commit/7d4ceeb07fcad2f55eef2cba73514f01af7cc2f3))
- **visio:** Use extensionless relative source imports ([2495aa9](https://github.com/ChristopherVR/ooxml/commit/2495aa92d52a0135106695a2a39a72c9f98cf177))
- **docx:** Share mark-to-run formatting conversion ([cba7fb1](https://github.com/ChristopherVR/ooxml/commit/cba7fb1ce7733a3faf6c9e463124ae69a47f6835))
- Use extensionless relative typescript imports ([ef81f39](https://github.com/ChristopherVR/ooxml/commit/ef81f394cd2f275bcc9db87830db24b0adb2ec8b))
- **docx:** Share paragraph attribute conversion ([132ce8b](https://github.com/ChristopherVR/ooxml/commit/132ce8ba237a61bbe2dbc93a0d76f80da17b0c00))

### Testing

- **xlsx:** Record native mixed-type lookup parity cases ([d4394b1](https://github.com/ChristopherVR/ooxml/commit/d4394b1488032cba2133475b553ab354f78db555))
- **xlsx:** Verify wrapped references across save and reload ([2cd5833](https://github.com/ChristopherVR/ooxml/commit/2cd583316ac5cedf438ad622e3440d5bdeeb2d43))
- **visio:** Record broader native gradient fidelity gaps ([4fd1a15](https://github.com/ChristopherVR/ooxml/commit/4fd1a151936827a10acc8b28709bb5803c9d0059))

## [0.23.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.23.0) - 2026-10-07

### Features

- **pptx:** Add PowerPoint's built-in SmartArt layout definitions ([9c6cd97](https://github.com/ChristopherVR/ooxml/commit/9c6cd97ba6276a441aadf0d527d3bdc81fabce5e))
- **pptx:** Apply built-in SmartArt layouts synchronously and save them ([4ddf31c](https://github.com/ChristopherVR/ooxml/commit/4ddf31c5f2f2a1b17e8af411ecd42bee7deaa491))

## [0.22.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.22.1) - 2026-10-06

### Bug Fixes

- **xlsx:** Remove polynomial regexes and harden local scripts ([e08d75a](https://github.com/ChristopherVR/ooxml/commit/e08d75a000f813b6d7a77a58adeccf6c0325e390))

## [0.22.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.22.0) - 2026-10-06

### Features

- **pptx:** Parse chart legend overlay from c:overlay ([dce36c6](https://github.com/ChristopherVR/ooxml/commit/dce36c6134cdaded271b73f541091b37223b6da2))
- **chart:** Move pie, radar, treemap and trendline helpers from pptx viewer ([c08a02b](https://github.com/ChristopherVR/ooxml/commit/c08a02b91b210c0f99c8c2dfbde02c2e1329fc57))
- **color:** Move text contrast and unit rgb helpers from pptx viewer ([2dcc341](https://github.com/ChristopherVR/ooxml/commit/2dcc341bd931610a9e9a8f4e8d53483cffbed8ec))
- **text:** Move tab leader and decimal tab helpers from pptx viewer ([3a5bcf0](https://github.com/ChristopherVR/ooxml/commit/3a5bcf0f4675db3d6831430c37db0c66c6814ef3))
- **geometry:** Move snap guides and align/distribute from pptx viewer ([3400e87](https://github.com/ChristopherVR/ooxml/commit/3400e8776661df9e2148e1be78819b1c12564b79))

### Bug Fixes

- **pptx:** Clear the old layout definition on a SmartArt layout switch ([086e06c](https://github.com/ChristopherVR/ooxml/commit/086e06cc28b0389da820f35b5fd4f482f2312de8))
- **xlsx:** Harden code-scanning findings across areas ([90ee4b3](https://github.com/ChristopherVR/ooxml/commit/90ee4b33e1253f21cd0df299af468d550f85eddc))
- **xlsx:** Use Reflect for dynamic property writes and tighten sanitizers ([b663413](https://github.com/ChristopherVR/ooxml/commit/b66341384d972d73182b06c6b4c706c0462f9364))

### Documentation

- **site:** Rewrite the repository README with hero, suite and quick start ([4c1f004](https://github.com/ChristopherVR/ooxml/commit/4c1f004423c92f043e8987db2c41b114d075c03c))
- Bring the pptx docs and agent guide up to date with the move ([8cc3f5e](https://github.com/ChristopherVR/ooxml/commit/8cc3f5e364232d39d2a2286e25056fd67b594108))

### Dependencies

- **deps:** Align emf-converter on 4.8.21 ([3c2859d](https://github.com/ChristopherVR/ooxml/commit/3c2859d0a43e66666015debaeaa985888727db95))

## [0.21.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.21.2) - 2026-10-06

### Refactor

- Make src/core a workspace package (by @ChristopherVR) ([d5b8d6d](https://github.com/ChristopherVR/ooxml/commit/d5b8d6d91161c9ae631aa84436afb35105ac9517))

## [0.21.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.21.1) - 2026-10-05

### Refactor

- Move ooxml-ui from packages/ui to src/ui (by @ChristopherVR) ([86901f3](https://github.com/ChristopherVR/ooxml/commit/86901f3edaf0d74363d06488bd8f5724be9f807e))
- Move the library into src/core, next to src/ui (by @ChristopherVR) ([3933a88](https://github.com/ChristopherVR/ooxml/commit/3933a88e36784ce5f4bfab0af1ca12eb65d3cd0c))

### Chores

- Merge the release commit into the restructure (by @ChristopherVR) ([efdb30a](https://github.com/ChristopherVR/ooxml/commit/efdb30a34873f71211e11a39f315b5dc3c3cd82c))

## [0.21.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.21.0) - 2026-10-05

### Features

- **chart:** Add the automatic value-axis scale (by @ChristopherVR) ([007f5b7](https://github.com/ChristopherVR/ooxml/commit/007f5b77507f99b8caf837fe0c82ea12d10465d6))
- **chart:** Add histogram and category binning (by @ChristopherVR) ([f3d564c](https://github.com/ChristopherVR/ooxml/commit/f3d564c705dc2f2ab6da4df4dcf590bd0c2df023))
- **pptx:** Add the pptx/ui subpath with the theme colour palette (by @ChristopherVR) ([0b7cde2](https://github.com/ChristopherVR/ooxml/commit/0b7cde28ecacc39bb80fbbebe1e6e9cb84e24634))
- **pptx:** Write chart spacing, axis visibility and area format (by @sedrew) ([5db45d5](https://github.com/ChristopherVR/ooxml/commit/5db45d573f28986acb8116f615ac0807a11afc91))
- **pptx:** Add chart spacing and area options to the chart SDK (by @sedrew) ([0e3e4ed](https://github.com/ChristopherVR/ooxml/commit/0e3e4ed0689e1ddfde5fdf1d0946ea60fb4bfe34))

### Bug Fixes

- **pptx:** Read series line style, keep table cell geometry fractional ([#6](https://github.com/ChristopherVR/ooxml/issues/6)) (by @IHAGI-c) ([f731f59](https://github.com/ChristopherVR/ooxml/commit/f731f59d5fc48c13e2a3032bc1566f10bae917af))
- **pptx:** Write c:scaling children in schema order (by @sedrew) ([a530d5b](https://github.com/ChristopherVR/ooxml/commit/a530d5b3f37badd4e6b12a6e7b387c23f28d84bb))

### Testing

- **pptx:** Cover chart spacing, axis visibility and area format (by @sedrew) ([5b912b7](https://github.com/ChristopherVR/ooxml/commit/5b912b7da0db97c58d56e3d9403a93a52e9408a7))

### Build & CI

- **viewers:** Make the viewers root workspaces with one lockfile (by @ChristopherVR) ([129c615](https://github.com/ChristopherVR/ooxml/commit/129c615fcf49bb15e25b136019be5425f6c36bd1))

### Chores

- **viewers:** Resolve imported viewers against this checkout (by @ChristopherVR) ([fc79891](https://github.com/ChristopherVR/ooxml/commit/fc798917be9668674973df731e56263ab063af4a))

## [0.20.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.20.0) - 2026-10-05

### Features

- **docx:** Move section edits, page setup, unit attrs and case into core (by @ChristopherVR) ([5e668b7](https://github.com/ChristopherVR/ooxml/commit/5e668b767189c06a2d739cd5809099643939ef9e))
- **xlsx:** Move the DOM-free editor logic into core (by @ChristopherVR) ([d6c6be1](https://github.com/ChristopherVR/ooxml/commit/d6c6be13ec5a1aa5826ca810a8a98b020d5c0878))
- **docx:** Move the DOM-free editor modules into core (by @ChristopherVR) ([e3bd270](https://github.com/ChristopherVR/ooxml/commit/e3bd2705501d0d30c715878ff2da87ff407fb961))
- **visio:** Move the DOM-free viewer modules into core (by @ChristopherVR) ([956cb90](https://github.com/ChristopherVR/ooxml/commit/956cb90371477a2e97e9036caf6f7b562d2a598b))

### Testing

- **xlsx:** Give the row-insert timing test headroom on shared runners (by @ChristopherVR) ([9c81002](https://github.com/ChristopherVR/ooxml/commit/9c81002188098eb8ad6230da1f80f339ea1fb8f1))

### Chores

- Lint with oxlint and pin oxfmt (by @ChristopherVR) ([e6e9aad](https://github.com/ChristopherVR/ooxml/commit/e6e9aade4bd74b3587acb80bd341b3e9505caf0b))

## [0.19.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.19.0) - 2026-10-05

### Features

- **docx:** Move column, line spacing and section helpers into core (by @ChristopherVR) ([b3beeb2](https://github.com/ChristopherVR/ooxml/commit/b3beeb2577c4cc6bcefe664f8e59499b124a8651))

## [0.18.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.18.0) - 2026-10-05

### Features

- **xlsx:** Move the formula editor text helpers into core (by @ChristopherVR) ([07e1108](https://github.com/ChristopherVR/ooxml/commit/07e110868a4287f529a87bf1e5147122f76d88df))

### Build & CI

- Add a script that reports dependency state across every repository (by @ChristopherVR) ([4b604ba](https://github.com/ChristopherVR/ooxml/commit/4b604ba58a472444eca8f77b3f0667c8a8f293b7))

## [0.17.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.17.0) - 2026-10-05

### Features

- **xlsx:** Add bond, coupon, discount-security and Treasury bill functions (by @ChristopherVR) ([761673c](https://github.com/ChristopherVR/ooxml/commit/761673c65671f8e802c69289160ace8b95bc76cb))
- **xlsx:** Add VDB, ENCODEURL, REGEXTEST, REGEXEXTRACT and REGEXREPLACE (by @ChristopherVR) ([c2c3eac](https://github.com/ChristopherVR/ooxml/commit/c2c3eacd6bd7f67a2dfa2657d5bb81b6c1a866fa))
- **xlsx:** Support iterative calculation for circular references (by @ChristopherVR) ([25c9307](https://github.com/ChristopherVR/ooxml/commit/25c930726dbbcbc8d692662347be89e786eb8452))

## [0.16.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.16.0) - 2026-10-04

### Features

- **xlsx:** Add F, beta and gamma inverses and the legacy distribution names (by @ChristopherVR) ([7218339](https://github.com/ChristopherVR/ooxml/commit/721833979bb5b9c939e08a29a1694251bb212e70))
- **xlsx:** Add Z.TEST, T.TEST, F.TEST, CHISQ.TEST and PROB (by @ChristopherVR) ([f86c3d9](https://github.com/ChristopherVR/ooxml/commit/f86c3d9cee3bf6d99c99e9d294ee19147fb9255c))
- **xlsx:** Add LINEST, LOGEST, TREND and GROWTH (by @ChristopherVR) ([d61c910](https://github.com/ChristopherVR/ooxml/commit/d61c9105d7b2ffd14426ae1e4f1a18d5da7d51f8))
- **xlsx:** Add the database functions (DSUM, DCOUNT, DGET and the rest) (by @ChristopherVR) ([8062b9d](https://github.com/ChristopherVR/ooxml/commit/8062b9d38729d74ae9e10ea279963e5d21fa03f4))

## [0.15.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.15.0) - 2026-10-04

### Features

- **teams:** Add the team-workspace logic area (by @ChristopherVR) ([c3cca75](https://github.com/ChristopherVR/ooxml/commit/c3cca752c7833b1e1f318c0c67287c5d0bff3a9e))

### Bug Fixes

- **teams:** Open files through short-lived signed links, not the token (by @ChristopherVR) ([5dcbc38](https://github.com/ChristopherVR/ooxml/commit/5dcbc38076192690018d1b37cc17fc042dfc4b6c))

### Dependencies

- **deps:** Update all dependencies (by @ChristopherVR) ([d13b03a](https://github.com/ChristopherVR/ooxml/commit/d13b03ad9cb10c74655d699e7799d11aca4b30a0))

## [0.14.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.14.1) - 2026-10-03

### Bug Fixes

- **collab:** Accept broadcast bytes cloned from another realm (by @ChristopherVR) ([03eb043](https://github.com/ChristopherVR/ooxml/commit/03eb0431c304641ba4e3f4e235625bc54c545105))

## [0.14.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.14.0) - 2026-10-03

### Features

- **collab:** Add broadcast channel transport and package adapter (by @ChristopherVR) ([9aa3f4a](https://github.com/ChristopherVR/ooxml/commit/9aa3f4ab8bbca06ede53c779e72342f3c8cb51ef))

## [0.13.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.13.0) - 2026-10-03

### Features

- **visio:** Import legacy VSD using the shared binary model (by @ChristopherVR) ([9810823](https://github.com/ChristopherVR/ooxml/commit/9810823ded5e2b1d6268914b7c9bd55a5ba62d0a))

## [0.12.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.12.0) - 2026-10-03

### Features

- **visio:** Admit proven inherited master shape moves (by @ChristopherVR) ([6cb176f](https://github.com/ChristopherVR/ooxml/commit/6cb176f4b8c58cb21b7aed30259e1dfc94371fb9))

### Performance

- **xlsx:** Reuse spill cells and index short row footprints (by @ChristopherVR) ([c3b7d37](https://github.com/ChristopherVR/ooxml/commit/c3b7d37c3cf2596a381b3b3d6ebce7a56a1e9aec))
- **xlsx:** Reuse validated full recalculation ordering (by @ChristopherVR) ([490f124](https://github.com/ChristopherVR/ooxml/commit/490f124e215853515c34d3f2504a700a62a97ee1))

## [0.11.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.11.0) - 2026-10-03

### Features

- **visio:** Move independently proven master instances (by @ChristopherVR) ([d6fc328](https://github.com/ChristopherVR/ooxml/commit/d6fc32885af6a7afe704a22337057a12c215dd3e))
- **automation:** Centralize document tools and compose MCP servers (by @ChristopherVR) ([8c586b5](https://github.com/ChristopherVR/ooxml/commit/8c586b56df6b5853cfb9dd971073a04687d985b0))

### Chores

- **style:** Format existing docs and package configuration (by @ChristopherVR) ([09a7466](https://github.com/ChristopherVR/ooxml/commit/09a7466e8289e8f1cd0165e7830138f73b93fcf2))

## [0.10.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.10.0) - 2026-10-03

### Features

- **visio:** Prove independent edits around active masters (by @ChristopherVR) ([5590c8a](https://github.com/ChristopherVR/ooxml/commit/5590c8af893e81b8a3d9f3f8874c9434821b6abd))
- **visio:** Evaluate bounded numeric formulas (by @ChristopherVR) ([2343de2](https://github.com/ChristopherVR/ooxml/commit/2343de2d82d863b7d9f765c07b8484b97a96917a))
- **crypto:** Share OOXML encryption, signatures, links and properties (by @ChristopherVR) ([050df71](https://github.com/ChristopherVR/ooxml/commit/050df71849a7ceae5bef03334c03a5bd4aeadc38))

### Bug Fixes

- **xlsx:** Fix 50+ Excel mismatches found in a full core review (by @ChristopherVR) ([4b4c7a0](https://github.com/ChristopherVR/ooxml/commit/4b4c7a006b22fe915ab9e682c37b20621c4869db))

## [0.9.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.9.0) - 2026-10-03

### Features

- Share chart text and svg geometry algorithms (by @ChristopherVR) ([bc2a7cd](https://github.com/ChristopherVR/ooxml/commit/bc2a7cdf2e5c77a2c7b1d92c63ba2b5188a1cbee))

## [0.8.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.8.0) - 2026-10-03

### Features

- **docx:** Preserve edits to cell vertical alignment (by @ChristopherVR) ([939eddf](https://github.com/ChristopherVR/ooxml/commit/939eddf3eb08a9333c399a1e46ec9c2f39150cdd))
- **docx:** Map layout fragments to source text ranges (by @ChristopherVR) ([55cbd6b](https://github.com/ChristopherVR/ooxml/commit/55cbd6bff039de1d383ef9434d3d54051e90357c))

## [0.7.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.7.0) - 2026-10-03

### Features

- **visio:** Add atomic geometry editing and bounded recalculation (by @ChristopherVR) ([dc60e01](https://github.com/ChristopherVR/ooxml/commit/dc60e01ff97ae4db5e346c9942cd4e9052ba7b9d))

## [0.6.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.6.0) - 2026-10-03

### Features

- **digest:** Add a shared area for synchronous digests (by @ChristopherVR) ([5094d3d](https://github.com/ChristopherVR/ooxml/commit/5094d3dd74f4313c7312867aec20ef25a4a344a4))
- **docx:** Preserve edits to individual table cell margins (by @ChristopherVR) ([c413404](https://github.com/ChristopherVR/ooxml/commit/c41340440621e94628cd26728b5947d493b2e4e7))
- **docx:** Preserve imported equations as display-only runs (by @ChristopherVR) ([7114aed](https://github.com/ChristopherVR/ooxml/commit/7114aed5e79a051dba9060129c3938b420144497))

### Bug Fixes

- **xlsx:** Verify Excel's modern sheet password hash (by @ChristopherVR) ([b38a0b7](https://github.com/ChristopherVR/ooxml/commit/b38a0b79b65f5bd00484fe9060fe1d065bb6e5ee))
- **xlsx:** Keep removed passwords removed and check every hash (by @ChristopherVR) ([5ef0c50](https://github.com/ChristopherVR/ooxml/commit/5ef0c503f1c6b48bd3ac15bb805a587a7e485d6a))

### Testing

- **pptx:** Preserve smartart across repeated save and reload (by @ChristopherVR) ([0a94952](https://github.com/ChristopherVR/ooxml/commit/0a949525b65b879dd10bad2641658e68d4c48036))

## [0.5.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.5.0) - 2026-10-03

### Features

- **math:** Share equation converters across office formats (by @ChristopherVR) ([2763d2a](https://github.com/ChristopherVR/ooxml/commit/2763d2afe28f0e3d7dead91d25d2011d2f618dc1))

### Bug Fixes

- **docx:** Preserve edited shading and automatic table widths (by @ChristopherVR) ([1d15587](https://github.com/ChristopherVR/ooxml/commit/1d15587d642872bda18c468d6dba13a1b2c39c33))

## [0.4.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.4.0) - 2026-10-02

### Features

- **visio:** Round bounded open orthogonal connectors (by @codex) ([2c6e66a](https://github.com/ChristopherVR/ooxml/commit/2c6e66afa7520e882d89498bebd117eb966476ea))
- **opc:** Add SpreadsheetML namespaces and relationship types (by @ChristopherVR) ([adc12c1](https://github.com/ChristopherVR/ooxml/commit/adc12c17c0255f56443cd5aea45e307eb6e68ae1))
- **xlsx:** Add the SpreadsheetML area (by @ChristopherVR) ([981e75b](https://github.com/ChristopherVR/ooxml/commit/981e75bf9f84dbedb8aafa99fea236c580cba9c2))

### Testing

- **xlsx:** Restore the Office user name after generating fixtures (by @ChristopherVR) ([2d9d2f9](https://github.com/ChristopherVR/ooxml/commit/2d9d2f950e3b43bad6811212850f0ecf2f0eb92b))

## [0.3.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-core@0.3.0) - 2026-10-02

### Features

- **visio:** Add bounded read-only VSDX scene core (by @codex) ([dee6d0d](https://github.com/ChristopherVR/ooxml/commit/dee6d0dd475d951e6fdb59994cc217674d496cd0))
- **visio:** Add bounded saves, fills and worker vector import (by @codex) ([7364222](https://github.com/ChristopherVR/ooxml/commit/7364222cc9687da5e10a5992c2bf373cb6d68d98))

## [0.2.0](https://github.com/ChristopherVR/ooxml-core/releases/tag/@christophervr/ooxml-core@0.2.0) - 2026-10-01

### Features

- **diagram:** Add a format-neutral SmartArt area (by @ChristopherVR) ([d5fc851](https://github.com/ChristopherVR/ooxml-core/commit/d5fc85134c512afc6109316b719659937c8c90da))
- **docx:** Read SmartArt drawings and preserve them on save (by @ChristopherVR) ([ab0e611](https://github.com/ChristopherVR/ooxml-core/commit/ab0e6113475918090d16249d3cbb850403d61339))
- **docx:** Add layout and load areas moved from docx-viewer (by @ChristopherVR) ([7350cc1](https://github.com/ChristopherVR/ooxml-core/commit/7350cc1ae92f5b682ebe809d173c3bd6252ea847))
- **collab:** Add the format-neutral collaboration area (by @ChristopherVR) ([f4cb051](https://github.com/ChristopherVR/ooxml-core/commit/f4cb0519a3d61cce7b6e0b829fe7ee6c064a6fd2))

### Refactor

- **pptx:** Re-import SmartArt parsers from the diagram area (by @ChristopherVR) ([f7a6f3a](https://github.com/ChristopherVR/ooxml-core/commit/f7a6f3acf856f42294ca3a9d1e051a79e22e6a0b))

### Testing

- **pptx:** Commit the e2e deck snapshot and stop reading from pptx-viewer (by @ChristopherVR) ([c3e0979](https://github.com/ChristopherVR/ooxml-core/commit/c3e09792c624155c9de416e844ba01b257218234))

### Build & CI

- Run the build steps in parallel and stop prepack rebuilding (by @ChristopherVR) ([4d25238](https://github.com/ChristopherVR/ooxml-core/commit/4d25238854ddf6169fbe4f72e535e6b78b27dfec))
- Automate releases from conventional commits with OIDC publishing (by @ChristopherVR) ([09d5a8b](https://github.com/ChristopherVR/ooxml-core/commit/09d5a8b7a09d045d525b1ce5b19b28844fcd2f6b))

### Chores

- **ui:** Scaffold the @christophervr/office-ui workspace package (by @ChristopherVR) ([6bb6ddd](https://github.com/ChristopherVR/ooxml-core/commit/6bb6ddd0e1bd3594996810639232070239b225a4))

## [0.1.0](https://github.com/ChristopherVR/ooxml-core/releases/tag/@christophervr/ooxml-core@0.1.0) - 2026-10-01

### Features

- **opc:** Add @christophervr/ooxml-opc (relationships, content types, zip helpers) (by @ChristopherVR) ([08e5427](https://github.com/ChristopherVR/ooxml-core/commit/08e5427cd24ab1ae03ba05fd0faef76a65ddeda1))
- **docx:** Move the Word core (model, parser, serializer, editing) into the docx area (by @ChristopherVR) ([b4f83e1](https://github.com/ChristopherVR/ooxml-core/commit/b4f83e123d492414258261095e72c8113459a630))
- **pptx:** Move the PowerPoint core from pptx-viewer into src/pptx (by @ChristopherVR) ([4638a2a](https://github.com/ChristopherVR/ooxml-core/commit/4638a2a991881d1e0b7fb9d89988bfd284911648))
- **pptx:** Write gradient fills for chart series and data points (by @ChristopherVR) ([3d80333](https://github.com/ChristopherVR/ooxml-core/commit/3d80333e33ed54240c488102b665fc3ef45a8377))

### Refactor

- One published package, @christophervr/ooxml-core, with an area per subpath (by @ChristopherVR) ([c8d5ef1](https://github.com/ChristopherVR/ooxml-core/commit/c8d5ef1acd2f7d545f8b5178a7101204064a0850))
- Treat docx and pptx symmetrically; publish via OIDC (by @ChristopherVR) ([1272e23](https://github.com/ChristopherVR/ooxml-core/commit/1272e2331f542bd01050303492fa9423aef359ee))

### Testing

- **pptx:** Declare group-drill.pptx in the fixture manifest; sync missing e2e decks every run (by @ChristopherVR) ([7a1b245](https://github.com/ChristopherVR/ooxml-core/commit/7a1b245f9d9bb342bcf6ea296fe3887da13c139c))

### Build & CI

- Compile ooxml-units to dist and export it for consumers (by @ChristopherVR) ([f7476df](https://github.com/ChristopherVR/ooxml-core/commit/f7476df1dc88fdaac213a44a2616afaf4fad4314))
- **pptx:** Subpath exports, relaxed tsconfig project and dual-format bundle for the pptx area (by @ChristopherVR) ([359be0b](https://github.com/ChristopherVR/ooxml-core/commit/359be0b60bb5f9b82df5d1a89fcb20d90dd4ad76))

### Chores

- Add CI, release workflow, package smoke test and community files (by @ChristopherVR) ([f1d4805](https://github.com/ChristopherVR/ooxml-core/commit/f1d48053fb86244b129de8d2bf96cc77ecf7f0eb))
