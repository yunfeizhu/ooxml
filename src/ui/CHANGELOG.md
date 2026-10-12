# Changelog

All notable changes to this project are documented here.
This file is generated from [Conventional Commits](https://www.conventionalcommits.org)
by [git-cliff](https://git-cliff.org); do not edit it by hand.
A release listed with no entries carried no Conventional Commit in this package's
scope: scripts/release-plan.mjs releases whenever any published file changes, not only on
conventional commits.

## [1.8.4](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.8.4) - 2026-10-11

### Testing

- **ui:** Clear the text selection between test files ([abb829f](https://github.com/ChristopherVR/ooxml/commit/abb829f2e3a4e6ff0a99a9023012d1d3ad0d8b51))
- **ui:** Measure the autofit clone against the body it started with ([0336f59](https://github.com/ChristopherVR/ooxml/commit/0336f5963f4422e405cd7a4ad4206ad395643949))
- **ui:** Compare body children to the starting count in two more tests ([cd39154](https://github.com/ChristopherVR/ooxml/commit/cd3915465a0192b2a6fa1dafde17a77d63c31316))

## [1.8.3](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.8.3) - 2026-10-11

### Bug Fixes

- **ui:** Refresh the Layouts gallery when the layout library loads ([817daaf](https://github.com/ChristopherVR/ooxml/commit/817daaf54f1f58d8d7b6a44d1c65ddeecb17591a))
- **ui:** Do not offer a page the autosave snapshot it wrote itself ([e6b2e1a](https://github.com/ChristopherVR/ooxml/commit/e6b2e1a42c58b349a33e8cc17e77918ae96373c4))

### Testing

- **ui:** Keep each DOM environment and test state in its own worker ([6d52bec](https://github.com/ChristopherVR/ooxml/commit/6d52bec41343129aa621e11e173fe3c706e82b6e))

### Styling

- Fix the oxfmt and oxlint warnings outside the viewers ([cd66f32](https://github.com/ChristopherVR/ooxml/commit/cd66f324a45aad1d9bd680d1518f0dbe8baf8fc3))

## [1.8.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.8.2) - 2026-10-11

### Bug Fixes

- **ui:** Let bridged themes re-derive the tokens that read them ([531dae6](https://github.com/ChristopherVR/ooxml/commit/531dae6f2fe1cf31894d54b46df31a1de934d954))
- **ui:** Keep visio drag previews until the source edit settles ([a004a29](https://github.com/ChristopherVR/ooxml/commit/a004a292913c4ec63fe6aa6e21196c36eeef9dff))

## [1.8.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.8.1) - 2026-10-10

### Testing

- **ui:** Give jsdom viewer tests time to settle under parallel load ([239f9ab](https://github.com/ChristopherVR/ooxml/commit/239f9abf933d35fe13220acc248c6bffd2464715))
- **ui:** Share workers across files and run one vitest process ([0c7a8e5](https://github.com/ChristopherVR/ooxml/commit/0c7a8e5aa0998d79c5fe6224264a5035a54dc773))

## [1.8.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.8.0) - 2026-10-10

### Features

- **ui:** Let a host add ribbon tabs to the Visio, Excel and Word UI ([101c552](https://github.com/ChristopherVR/ooxml/commit/101c552196d3b9e2befa280b8ed795e4cf8a04b8))
- **visio:** Match Visio's ribbon tabs and title bar layout ([f57ee8e](https://github.com/ChristopherVR/ooxml/commit/f57ee8e649314514faf7f7656cdb7ca719967eea))
- **visio:** Show Quick Styles, Themes and Variants inline in the ribbon ([30baa65](https://github.com/ChristopherVR/ooxml/commit/30baa655815a974c41c5947e51d9809f3939ef40))
- **visio:** Collapse ribbon groups into buttons in a narrow window ([a9fd1a1](https://github.com/ChristopherVR/ooxml/commit/a9fd1a1b343068cca5436a0c05539ccd9b3419dc))
- **ui:** Add office-ui-color-grid, Office's colour picker body ([6d8a8aa](https://github.com/ChristopherVR/ooxml/commit/6d8a8aaa9d9aedd74428b8d37e56286896d9ca05))
- **visio:** Add Office's colour picker and a Format Shape task pane ([021f43b](https://github.com/ChristopherVR/ooxml/commit/021f43bb4267b4022cd7b771d03aadf2279a6d55))
- **visio:** Add AutoConnect arrows with a Quick Shapes mini toolbar ([55c5f4b](https://github.com/ChristopherVR/ooxml/commit/55c5f4bb7652d7f3ea70515357ab4815b8461b72))
- **visio:** Show the drawing's own stencils in the Shapes window ([913edfa](https://github.com/ChristopherVR/ooxml/commit/913edfa639320bb7c5eb0eb6dea91c794dc1e999))
- **visio:** Offer resize, move, rotate and formatting on stencil shapes ([6795c0e](https://github.com/ChristopherVR/ooxml/commit/6795c0ed6106f781178a49aecefd687993998479))
- **ribbon:** Add a core area for the ribbon add-in tab descriptor ([7b2fa48](https://github.com/ChristopherVR/ooxml/commit/7b2fa48d2562d7483e03acf573e74404342b8f2a))
- **visio:** Make ribbon add-in tabs a prop and event of every binding ([6e6a157](https://github.com/ChristopherVR/ooxml/commit/6e6a157bbced977145d428e2ca01168e0a413deb))
- **docx:** Make ribbon add-in tabs a prop and event of every binding ([819c1a3](https://github.com/ChristopherVR/ooxml/commit/819c1a38c2beb9605676d29994b71a7a6f7e4a15))
- **xlsx:** Make ribbon add-in tabs a prop and event of every binding ([691f553](https://github.com/ChristopherVR/ooxml/commit/691f5531b9f5b4a5a5ac0645b43c8c0fc55be5d8))
- **ui:** Add the shared pieces of PowerPoint ribbon add-in tabs ([70a3376](https://github.com/ChristopherVR/ooxml/commit/70a3376eaf1cc1bdbf1208baa626e2a850318261))
- **visio:** Draw line jumps and toggle them from Design > Connectors ([842ddbb](https://github.com/ChristopherVR/ooxml/commit/842ddbb2f64602a3c201678d73bb01aa45cfd9d7))
- **visio:** Add the Ruler & Grid dialog, saved to the page ([f6646a8](https://github.com/ChristopherVR/ooxml/commit/f6646a84815af9148b7e18351eb4b2488b47d6d4))
- **visio:** Add the Snap & Glue dialog, saved to the drawing ([f96c927](https://github.com/ChristopherVR/ooxml/commit/f96c927906a6e4d6872b4667439726460d91dd61))
- **visio:** Insert a horizontal legend from Data > Insert Legend ([92ac505](https://github.com/ChristopherVR/ooxml/commit/92ac5055f1325d1bff1472d822d31d027d80455c))
- **visio:** Edit stencil groups and their parts in the viewer ([977bc39](https://github.com/ChristopherVR/ooxml/commit/977bc397b2255bfc8e10462dadfec63544a3816c))
- **visio:** Measure text in the edit worker, grow the editing frame ([e54f715](https://github.com/ChristopherVR/ooxml/commit/e54f715afe410b209e2d2c01bfc0d68089c4a177))
- **visio:** Offer glue and end handles on stencil shapes and connectors ([7d815b9](https://github.com/ChristopherVR/ooxml/commit/7d815b9f29508f5427a70abcab7728d9a57a785d))
- **visio:** Drop the Dynamic connector from the Document Stencil ([93eb00a](https://github.com/ChristopherVR/ooxml/commit/93eb00ae70b5ffd830c7644a1910fac39faf7b68))
- **visio:** Offer whole-shape commands on stencil shapes ([4734035](https://github.com/ChristopherVR/ooxml/commit/4734035524b0cac0f084dab62db406d2d01e3f07))
- **visio:** Pick theme colours that follow the page theme ([d29c9c7](https://github.com/ChristopherVR/ooxml/commit/d29c9c7b8ae343821db3461ca55af2283d6a19ef))
- **ui:** Add office-ui-color-custom, the Colors dialog's Custom tab ([ae061fd](https://github.com/ChristopherVR/ooxml/commit/ae061fd4add660a2c21db5f2c2ffcd15b3b5d975))
- **visio:** Put patterns, line ends and effects in Format Shape ([bae5aa8](https://github.com/ChristopherVR/ooxml/commit/bae5aa8739754f26fccd429d34224f8f68766368))
- **visio:** Drop stencil shapes as master instances in the editor ([d9f1a96](https://github.com/ChristopherVR/ooxml/commit/d9f1a96ddc6e13daf9853c43e7475116a090e445))
- **visio:** Offer built-in shapes in Change Shape on stencil shapes ([e8de13f](https://github.com/ChristopherVR/ooxml/commit/e8de13f6e4500e7312ab39f2d80269a1ec052fff))

### Bug Fixes

- **pptx:** Keep the browser's image drag out of picture moves ([817a36a](https://github.com/ChristopherVR/ooxml/commit/817a36a1eae21a48e149ee5459597577dd2cdf22))
- **ui:** Keep add-in panels when only their callbacks change ([2ff04e4](https://github.com/ChristopherVR/ooxml/commit/2ff04e4295d102cb9ad1e04cfe3f330aaad26a3f))
- **ui:** Draw add-in commands in editors that never registered them ([deb027d](https://github.com/ChristopherVR/ooxml/commit/deb027dbaabbe087b488ecef68499cd0e37d7919))
- **ui:** Honour c:dispBlanksAs in combo line series ([#45](https://github.com/ChristopherVR/ooxml/issues/45)) ([00fd4b2](https://github.com/ChristopherVR/ooxml/commit/00fd4b2a5268974ee19d4f9810d421af161666aa))

### Refactor

- **visio:** Put the External Data window on the shared task pane ([a9c094a](https://github.com/ChristopherVR/ooxml/commit/a9c094a939a110ea31b0feae0b5c2ff7a2a9a58b))
- **geometry:** Move the orthogonal connector router out of pptx ([7628894](https://github.com/ChristopherVR/ooxml/commit/7628894c847d098846b7250e8cf7cfee0b8e1ecd))
- **ui:** Move Excel and Word colour pickers onto the shared grid ([ab332b6](https://github.com/ChristopherVR/ooxml/commit/ab332b6ed7a4b80bc5016de05efb3fad694c85de))

### Documentation

- **visio:** Format the Visio and ooxml-ui READMEs ([cd76ee2](https://github.com/ChristopherVR/ooxml/commit/cd76ee27e0961385949517e7e95a8405aecbcf35))
- **ui:** Describe ribbon add-in tabs as they now work in every editor ([fd056a8](https://github.com/ChristopherVR/ooxml/commit/fd056a85965d1d6a84de4ba3c880b67237632ed8))

### Testing

- **visio:** Align stencil-instance tests with the merged behaviour ([1f184fd](https://github.com/ChristopherVR/ooxml/commit/1f184fde8172da3c5fee2d204b401a11e57633b7))
- **visio:** Give the effects preset walk a longer timeout ([a0fa1f2](https://github.com/ChristopherVR/ooxml/commit/a0fa1f2b27a745b5b70acabc70d18bb3bd312b1b))
- **ui:** Run the ui suite on happy-dom by default ([f805e22](https://github.com/ChristopherVR/ooxml/commit/f805e22a365bd2b9493efc3a835e2ef1fa89681c))

### Styling

- **visio:** Format the ribbon overflow files ([235b8f0](https://github.com/ChristopherVR/ooxml/commit/235b8f0fbb7853e240c15a84d30d3416689f0c38))
- Apply oxfmt to files drifted from the formatter ([daeabf2](https://github.com/ChristopherVR/ooxml/commit/daeabf26125af866f90359ac8a5716234d5b8b36))

## [1.7.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.7.0) - 2026-10-10

### Features

- **geometry:** Share arrow-key nudges and Shift angle snapping ([a839871](https://github.com/ChristopherVR/ooxml/commit/a8398713b97bcc9a193e6bd85aba51c55066eba8))
- **visio:** Nudge with arrow keys and snap moves to the grid ([efacb75](https://github.com/ChristopherVR/ooxml/commit/efacb75c896f64a7252b9200c5e0e0d4ba0f13e9))
- **ui:** Add office-ui-task-pane and a plain tab strip variant ([8fdee5a](https://github.com/ChristopherVR/ooxml/commit/8fdee5af4f5f7f62dd77bb8974e8312d6900cb58))
- **visio:** Match Visio's task panes, status bar and in-place text ([c7c0106](https://github.com/ChristopherVR/ooxml/commit/c7c010697f52b2b2e2b580cf1914279c1e99a127))
- **visio:** Add an Office Theme for the status bar and finish its chrome ([60a8b51](https://github.com/ChristopherVR/ooxml/commit/60a8b51710832eaac158248677da4d3dadeb0052))
- **visio:** Edit formatted, field and partial text of stencil shapes ([2779656](https://github.com/ChristopherVR/ooxml/commit/27796562ef728a6be884967e9ed84323c480c16b))
- **visio:** Give the editor Visio's title bar and Office Theme: Black ([9f14793](https://github.com/ChristopherVR/ooxml/commit/9f14793f3dc0bd605454352a858b489c2c59dbbd))
- **visio:** Add Layer Properties as Visio's dialog, saved to the drawing ([8091265](https://github.com/ChristopherVR/ooxml/commit/809126590cbae8e7e41c80e3261754fe2afbb0ee))

## [1.6.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.6.2) - 2026-10-09

### Dependencies

- **deps:** Bump the production-minor-and-patch group with 5 updates ([#42](https://github.com/ChristopherVR/ooxml/issues/42)) ([fda493e](https://github.com/ChristopherVR/ooxml/commit/fda493e2697908c477ce845019d9c2fe8b591ab2))

## [1.6.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.6.1) - 2026-10-09

### Bug Fixes

- **pptx:** Paint the outline gradient of chart line series ([#41](https://github.com/ChristopherVR/ooxml/issues/41)) ([158d44b](https://github.com/ChristopherVR/ooxml/commit/158d44bd79582591697e9d6ef8ccc5311dc6d1f4))

## [1.6.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.6.0) - 2026-10-09

### Features

- **ui:** Add visio presentation mode ([7ef7441](https://github.com/ChristopherVR/ooxml/commit/7ef7441dcaa50bd97632ecf42d7a1bbaa221c0ba))
- **ui:** Enable visio freeform, pencil and arc drawing tools ([1e38ad9](https://github.com/ChristopherVR/ooxml/commit/1e38ad97a81a1f1ec023922835d501e1f7543ba2))
- **ui:** Enable the visio change shape gallery ([65b3219](https://github.com/ChristopherVR/ooxml/commit/65b32194f83ba875649898ec066b847dfc353a4a))
- **ui:** Enable format painter and change case in the visio ribbon ([55395f7](https://github.com/ChristopherVR/ooxml/commit/55395f7b12d272039a9ae5269ce65d3d13a8c75a))
- **ui:** Enable visio quick styles gallery and shadow effects ([d485ce2](https://github.com/ChristopherVR/ooxml/commit/d485ce2714783c770d81f47f55e9eb83b8f90ba7))
- **ui:** Enable visio insert pictures, link and screentip ([d4a01ad](https://github.com/ChristopherVR/ooxml/commit/d4a01ad4e80333607c04a5a97fa6b6a7926f2fa3))
- **ui:** Enable visio group and ungroup commands ([82f79c7](https://github.com/ChristopherVR/ooxml/commit/82f79c77e7e5cd2636c53dc1a4f442e80c02f154))
- **ui:** Enable the visio connector tool with glue target feedback ([2614be1](https://github.com/ChristopherVR/ooxml/commit/2614be14dfb949eebc9e11e8a04e0f4075c7186d))
- **ui:** Add visio page setup, backgrounds and page breaks ([d64077d](https://github.com/ChristopherVR/ooxml/commit/d64077d54f52b78d8b8249bc3e1011bcb0620dd7))
- **ui:** Add visio themes, variants, effects and the format shape pane ([397cf6f](https://github.com/ChristopherVR/ooxml/commit/397cf6f7b295d2703f5df3d6b976e613b46a372d))
- **ui:** Enable visio comments, reports, diagram checks and subprocess ([6d03f65](https://github.com/ChristopherVR/ooxml/commit/6d03f65939a9788b7bdf5f22c8f4b663e01c9a57))
- **ui:** Add visio more shapes, quick shapes, containers and callouts ([d115659](https://github.com/ChristopherVR/ooxml/commit/d1156595cf5685d8154718af3452d19e7e51e568))
- **ui:** Enable the visio data tab with import, linking and data graphics ([fc88751](https://github.com/ChristopherVR/ooxml/commit/fc887514fc44310a895f4183fb903be415e951a6))
- **ui:** Add visio connection points, point glue and connector styles ([53fdb86](https://github.com/ChristopherVR/ooxml/commit/53fdb86c3b6d99b73bc28346a148b1e7f40a5873))
- **ui:** Enable visio layout, layers, select by type, guides and pdf ([b278a33](https://github.com/ChristopherVR/ooxml/commit/b278a339ca7904195ad8382f8ad2c8e5f62a4833))
- **ui:** Add visio text dialog, text block tool, symbol and field ([a510104](https://github.com/ChristopherVR/ooxml/commit/a5101049323feba94182e5802b2de399ba2f019a))

### Bug Fixes

- **ui:** Make dropped visio shapes visible and never lose a drop ([fa2f36e](https://github.com/ChristopherVR/ooxml/commit/fa2f36e9c7be0c54f5649d30c0d08183b81c5ccf))
- **visio:** Show one colour rule when every value is equal ([00bc35c](https://github.com/ChristopherVR/ooxml/commit/00bc35c94781e428bca99820aca216d7030cf73e))
- **ui:** State the visio AutoConnect limit precisely ([89ac6fd](https://github.com/ChristopherVR/ooxml/commit/89ac6fd4803928ca5b4fa9e3df763d36e51970d6))
- **ui:** Keep visio text dialogs hidden and the text block overlay clear ([13eb01d](https://github.com/ChristopherVR/ooxml/commit/13eb01d47ce0147a000506cf21eeb121ac8606bd))
- **ui:** Size the symbol picker in em and drop unused visio ribbon helpers ([d4b4c11](https://github.com/ChristopherVR/ooxml/commit/d4b4c113611809a2164024f1df23964f3ea838af))
- **pptx:** Follow slide links outside slide shows ([#38](https://github.com/ChristopherVR/ooxml/issues/38)) ([f3e99cb](https://github.com/ChristopherVR/ooxml/commit/f3e99cb2d4faaefbfbb8e8c3a130744665f9be3c))

### Testing

- **ui:** Expect browser spelling and a disabled thesaurus in review ([bdc9575](https://github.com/ChristopherVR/ooxml/commit/bdc9575ec73d2b3b46f95ca2efaaee31d46abb16))

## [1.5.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.5.0) - 2026-10-09

### Features

- **ui:** Enable every master in the visio shapes window ([5066db2](https://github.com/ChristopherVR/ooxml/commit/5066db2dba537952c8c282161b924b3e92d2c85b))

### Bug Fixes

- **pptx:** Keep exact line spacing when a line holds a larger run ([6b8fd6a](https://github.com/ChristopherVR/ooxml/commit/6b8fd6a42dee5e0c879a98e3e945bf01d9b2bc5e))

## [1.4.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.4.1) - 2026-10-08

### Bug Fixes

- **ui:** Restore CI after the Visio find and replace changes ([f0ca01d](https://github.com/ChristopherVR/ooxml/commit/f0ca01d6618346cee74b723cfb9cb16f61eb1cb3))
- **ui:** Keep a folded ribbon group open for popup buttons ([88a9d78](https://github.com/ChristopherVR/ooxml/commit/88a9d78d5f3188c5b725d9c5baa0cd6568c954e2))
- **ui:** Restore only the device-pixel var after an export style read ([01c157b](https://github.com/ChristopherVR/ooxml/commit/01c157b4c5ec2f4248216368ef2e20b8bc282dd5))
- **xlsx:** Correct table, subtotal, save and sheet protection behavior ([#32](https://github.com/ChristopherVR/ooxml/issues/32)) ([af31ec6](https://github.com/ChristopherVR/ooxml/commit/af31ec670c229eabb8515e04bacf9f2c277ef053))
- **ui:** Keep table resize handles off merged cells ([e8b99ee](https://github.com/ChristopherVR/ooxml/commit/e8b99ee588ecd856fd4f201a96262c4a62637aef))
- **ui:** Keep morph twins from stealing in-place wheel wedges ([cd1df51](https://github.com/ChristopherVR/ooxml/commit/cd1df5149446afb5b790bc744cbf51d50e5b01b0))
- **visio:** Resolve open code-scanning alerts ([a6bb188](https://github.com/ChristopherVR/ooxml/commit/a6bb188c4da9285a09589f6716b112aee82edb8b))

### Documentation

- Refresh the readmes with webp images and the office suite ([6a800d0](https://github.com/ChristopherVR/ooxml/commit/6a800d062bc911d6c4ea682bdbffa7fc437d1556))

### Testing

- **ui:** Silence expected lit and jsdom canvas warnings ([47deb26](https://github.com/ChristopherVR/ooxml/commit/47deb26c4830af0804c59a2336020e6c14170690))

## [1.4.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.4.0) - 2026-10-08

### Features

- **visio:** Enable source-backed formatting and shape ordering ([c39f7be](https://github.com/ChristopherVR/ooxml/commit/c39f7bee397d27afa31155a96c01997122402773))
- **visio:** Enable multi-selection formatting and arrangement ([fb70098](https://github.com/ChristopherVR/ooxml/commit/fb70098a2b100d6ec37cd091acd618c91477cfb2))
- **visio:** Enable rich formatting and source duplication ([d50e388](https://github.com/ChristopherVR/ooxml/commit/d50e388f9190809d6a860894663cdbf774ca4dca))
- **visio:** Enable source-backed shape clipboard ([2c13c1f](https://github.com/ChristopherVR/ooxml/commit/2c13c1f39998cf37e83d3949a6685f84f4b16e4d))
- **visio:** Enable new drawings and pointer selection gestures ([75ac409](https://github.com/ChristopherVR/ooxml/commit/75ac409e5e67c23203c765d3aa472b6817853090))
- **visio:** Enable resize handles and size and position pane ([7601406](https://github.com/ChristopherVR/ooxml/commit/76014064de44defbf80208cd0fab1f33ef17c00b))
- **visio:** Enable text tools and atomic drawing creation ([b8376f2](https://github.com/ChristopherVR/ooxml/commit/b8376f2575f2e594a713456d820bfb64e5048483))
- **visio:** Enable shared fill and line properties ([9ae72a0](https://github.com/ChristopherVR/ooxml/commit/9ae72a00656d2c17b8b09a51a1ac9c262654898a))

## [1.3.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.3.0) - 2026-10-08

### Features

- **ui:** Add pptx-ui-ribbon-actions for the powerpoint tab row ([ce94a31](https://github.com/ChristopherVR/ooxml/commit/ce94a3170ec8f09ecd83e8bf4fe424dff3225153))

### Bug Fixes

- **ui:** Keep thin pptx strokes at least one device pixel on screen ([bb1df44](https://github.com/ChristopherVR/ooxml/commit/bb1df4463b9321ce6b57214037ac938bb1d33296))
- **pptx:** Default an absent c:gapWidth to 150 ([e16f565](https://github.com/ChristopherVR/ooxml/commit/e16f5651541cfbba9b7a1280e58463c041e507d9))
- **pptx:** Clip stacked lines and areas to the plot area ([5556f31](https://github.com/ChristopherVR/ooxml/commit/5556f315cff31eb8d2be7063eb2db46ecff34d05))
- **pptx:** Label only the visible part of clipped stacked bars ([2285eef](https://github.com/ChristopherVR/ooxml/commit/2285eef11fb513364ee0994a495c41e43f33d678))
- **xlsx:** Format selection statistics with the cell number format ([649f556](https://github.com/ChristopherVR/ooxml/commit/649f5568b348083aa548b2e819da02435d68d64a))
- **docx:** Place editing mode, comments and share like office ([9fed33b](https://github.com/ChristopherVR/ooxml/commit/9fed33bda8aae213ce439510a328293d0451ce48))
- **ui:** Size the chat composer's touch layout from tokens ([42bb661](https://github.com/ChristopherVR/ooxml/commit/42bb66145246c14a93e2ade14092b78c6e2a9d09))

### Performance

- **ui:** Build the excel formula graph in idle time ([f4e3b4e](https://github.com/ChristopherVR/ooxml/commit/f4e3b4e4ce3d6d7b8221320a8165622fd4d89719))

### Refactor

- **ui:** Share the ribbon actions between excel and word ([b34bbaf](https://github.com/ChristopherVR/ooxml/commit/b34bbaf3aba00c208df249bc263a451396357d77))

## [1.2.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.2.0) - 2026-10-08

### Features

- **ui:** Give the visio viewer the shared theme tokens ([1121dfe](https://github.com/ChristopherVR/ooxml/commit/1121dfeea611fcf86c15b1365c7ad0beb84d51b0))
- **ui:** Extend the shared ruler for word documents ([81451bd](https://github.com/ChristopherVR/ooxml/commit/81451bd3b77b52e71d3d274f62f1887b968d2052))
- **ui:** Draw sparklines in the excel grid ([e015d99](https://github.com/ChristopherVR/ooxml/commit/e015d9963dd4429b46979873394e97022ba7d38d))
- **ui:** Extend the shared title bar and status bar tokens ([9ff07df](https://github.com/ChristopherVR/ooxml/commit/9ff07df93a6e6507cd132dafe7361a68589aec9f))
- **ui:** Add the shared comments pane ([ec3d140](https://github.com/ChristopherVR/ooxml/commit/ec3d1409316c3f3bd76c3b6fa4f4bbc4b1d22a04))
- **ui:** Share excel workbooks over the collab session ([0d274d2](https://github.com/ChristopherVR/ooxml/commit/0d274d2455cef4ef7c3f0c44578bd96a7719fbda))
- **docx:** Draw charts in the editor and print layout ([da2ed18](https://github.com/ChristopherVR/ooxml/commit/da2ed1850715cf85d01ecc4f3967aa48d9414348))
- **ui:** Add showCompatibilityToasts root option ([992adda](https://github.com/ChristopherVR/ooxml/commit/992adda597325f8d2c9ca5fcbf612ac4da1b65c0))
- **ui:** Integrate suite storage and teams host controls ([f0c9f6c](https://github.com/ChristopherVR/ooxml/commit/f0c9f6cabc3f7cbde6f8e080946375b2733856a6))
- **ui:** Add a right-aligned actions slot to the ribbon tabs ([b8943a6](https://github.com/ChristopherVR/ooxml/commit/b8943a6b49a0fa3f9f8e90debc6b8b0eb132ea8e))
- **ui:** Add a summary slot to the status bar ([c11c2b8](https://github.com/ChristopherVR/ooxml/commit/c11c2b814230a9442d970d3364a30519f6fc8ed1))

### Bug Fixes

- **ui:** Use spacing tokens in the ruler marker styles ([6acef4b](https://github.com/ChristopherVR/ooxml/commit/6acef4b098fcf47c10d8a380648caa95de1465ad))
- **xlsx:** Report sparklines as shown in the feature notes ([1db5daa](https://github.com/ChristopherVR/ooxml/commit/1db5daacd00458cdd74e6913ea5b6c627bbe6543))
- **ui:** Map chart style numbers to the palettes office uses ([c16145d](https://github.com/ChristopherVR/ooxml/commit/c16145de0c649e401259f25a0cacc06a3f5c409d))
- **ui:** Register office-ui-ruler when word creates its ruler ([e4eb8df](https://github.com/ChristopherVR/ooxml/commit/e4eb8dffbc27a863ad17da03a22572c6ffe8cd9b))
- **ui:** Publish shared visio drawings from settled state ([cb7c587](https://github.com/ChristopherVR/ooxml/commit/cb7c587e11a9d52bb86e405501f6623d2fa9eb57))
- **pptx:** Build chart style palettes over the deck theme ([7ab9527](https://github.com/ChristopherVR/ooxml/commit/7ab9527743dbb1dc1438d2d3e6e73553b13e54b7))
- **pptx:** Lay out table cell paragraphs with their own spacing ([c3db7c5](https://github.com/ChristopherVR/ooxml/commit/c3db7c57596d8f31e24b2d556ed1eea8dddad90a))
- **pptx:** Align every paragraph when a table cell is aligned ([1bb7e7d](https://github.com/ChristopherVR/ooxml/commit/1bb7e7de568a0d8a6808862fd6dc4367782e9686))
- **pptx:** Skip chart axis lines and gridlines set to no line ([c6a9fcb](https://github.com/ChristopherVR/ooxml/commit/c6a9fcb0fb07498acf6db64d9ee9417339a6f2ac))
- **pptx:** Draw value gridlines only for axes with c:majorGridlines ([3229b2e](https://github.com/ChristopherVR/ooxml/commit/3229b2e67395d24faeb803e6447fe34b07e44770))
- **pptx:** Apply a table cell run's character spacing ([6d1ee14](https://github.com/ChristopherVR/ooxml/commit/6d1ee148cbd0ea058ae032a7a3b8fe9cdace1ce1))
- **pptx:** Size stacked bars from c:gapWidth ([c951292](https://github.com/ChristopherVR/ooxml/commit/c951292dd2f4ef06b216d075554a0c5f5d6b043f))
- **pptx:** Honour c:min and c:max on stacked charts ([0895267](https://github.com/ChristopherVR/ooxml/commit/08952672d90597d8cb99102652657c6c419f5fb7))
- **xlsx:** Place editing mode, comments and share like excel ([2d161c7](https://github.com/ChristopherVR/ooxml/commit/2d161c71022b08c44d7dd7f5274acbf44f80bc1c))
- **xlsx:** Show the selection statistics before the view buttons ([c64c804](https://github.com/ChristopherVR/ooxml/commit/c64c80415c93f95db8ef48a4b4bd57f0bb0bd934))
- **ui:** List the ribbon actions and status summary slots ([65fb8af](https://github.com/ChristopherVR/ooxml/commit/65fb8afd31cd7db0bb22a4d73e90aa31b8b9c833))
- **ui:** Escape deck text in the foreignObject export document ([60ad105](https://github.com/ChristopherVR/ooxml/commit/60ad105c4753f4a9e31c24873d0da83291b037f8))

### Refactor

- **ui:** Use the Drawing type names ([02a8884](https://github.com/ChristopherVR/ooxml/commit/02a8884b2c07e8b935425fd772b9edea6c31f840))
- **ui:** Feed the xlsx office tokens from the shared bridge ([a851f3e](https://github.com/ChristopherVR/ooxml/commit/a851f3e02c6e3fc53c886aa03fdef5e62b0aca0d))
- **ui:** Drive the word ruler through office-ui-ruler ([767c09d](https://github.com/ChristopherVR/ooxml/commit/767c09dce172f384313f215bfec9ad46a4ca33f2))
- **ui:** Theme the pptx title and status bars through host tokens ([e2effd1](https://github.com/ChristopherVR/ooxml/commit/e2effd14164fa04a1476cf9f16439b5f12518528))
- **ui:** Show word comments in the shared pane ([951b4ed](https://github.com/ChristopherVR/ooxml/commit/951b4ed01e1d3f17725d15e45d960a579e7e89d1))
- **ui:** Show excel comments in the shared pane ([4a7ee1b](https://github.com/ChristopherVR/ooxml/commit/4a7ee1b40f88fd25cacb04b2ef0a6dbbc0b58138))

### Testing

- **ui:** Speed up the yjs inline comments suite ([7c8e88d](https://github.com/ChristopherVR/ooxml/commit/7c8e88d936e6539ae1e4cf12f402584bd076fcdb))
- **xlsx:** Assert one status bar and excel's tab-row actions ([91b6054](https://github.com/ChristopherVR/ooxml/commit/91b6054b0c03c637af972e9a174e5e7308f21cfb))

### Chores

- **ui:** Extend the base tsconfig in the pptx project ([581528e](https://github.com/ChristopherVR/ooxml/commit/581528e1eec8d7b8c45d79139809ba7a723939a0))
- **ui:** Regenerate the custom elements manifest for the ruler ([3a744b9](https://github.com/ChristopherVR/ooxml/commit/3a744b9fca030c32282dc1d0c9a5be39dd24dffd))
- **scripts:** Expand every wildcard in package smoke subpaths ([f240a06](https://github.com/ChristopherVR/ooxml/commit/f240a06302ce04102f52a4df11dae529009dbc3b))

## [1.1.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.1.0) - 2026-10-08

### Features

- **ui:** Enable proven visio group rotation interactions ([be9ca55](https://github.com/ChristopherVR/ooxml/commit/be9ca5586434432f1673d42f5a0a6560ace25d83))
- **docx:** Track plain paragraph splits and joins ([0b11ba1](https://github.com/ChristopherVR/ooxml/commit/0b11ba1e3599cd082d68862010c4c2576a5b8410))

### Bug Fixes

- **docx:** Retain locked caches during field updates ([9cad7c9](https://github.com/ChristopherVR/ooxml/commit/9cad7c9b61fd76d900cef945f6766547e164e64e))
- **docx:** Repair complex field lock metadata after edits ([93b8b4e](https://github.com/ChristopherVR/ooxml/commit/93b8b4e9662c5aaf0bb7a94f599492d0441ffa93))

### Testing

- **docx:** Verify mounted tracked field replacements ([c305e45](https://github.com/ChristopherVR/ooxml/commit/c305e459da59d489e241b164cf049956e7c2c52f))

## [1.0.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@1.0.0) - 2026-10-07

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
- **xlsx:** Pair gradient fields with shared range controls ([dba0182](https://github.com/ChristopherVR/ooxml/commit/dba01824576dc7d329e0e4185ecf8a302f75e823))
- **docx:** Resolve inline object formatting history ([9689395](https://github.com/ChristopherVR/ooxml/commit/9689395a265d78a0f472f4880b6191130d2a9b43))
- **docx:** Project prior inline object formatting ([73691b8](https://github.com/ChristopherVR/ooxml/commit/73691b88ba16cf53b10aaaf68696ecb1c95980e8))
- **docx:** Record inline object formatting in shared history ([5de353d](https://github.com/ChristopherVR/ooxml/commit/5de353df2cf0b61b921dd2fef0141485292db1d8))
- **xlsx:** Add native named gradient preset gallery ([47ec692](https://github.com/ChristopherVR/ooxml/commit/47ec69208803df71d035ba191653134ec475ff26))
- **docx:** Preserve hard-break formatting and shared history ([a4dfbc4](https://github.com/ChristopherVR/ooxml/commit/a4dfbc40088ad577195695092149bdd195d798f2))
- **visio:** Resize native local lines through the width cell ([cdb9b5f](https://github.com/ChristopherVR/ooxml/commit/cdb9b5f5e2f393de2e740489920e70bdc820f1c2))
- **docx:** Share font commands across text and inline objects ([469c0d4](https://github.com/ChristopherVR/ooxml/commit/469c0d4b8f9d3a43dbcb2ef907ce472c2ba8e5ad))
- **xlsx:** Add rectangular gradient geometry controls ([e10c21a](https://github.com/ChristopherVR/ooxml/commit/e10c21a08bf6fdc3238504d7434db3f0b2a8b68f))
- **visio:** Drag local line endpoints on the canvas ([f68d353](https://github.com/ChristopherVR/ooxml/commit/f68d35354731f13c283032d81d2d11aec9c4b783))
- **docx:** Preserve inline hyperlinks through shared commands ([d1e7bf0](https://github.com/ChristopherVR/ooxml/commit/d1e7bf05f53d7b84fa2b7da3aec4ea006f629b8f))
- **xlsx:** Author radial and path fills on chart series ([2d3652a](https://github.com/ChristopherVR/ooxml/commit/2d3652ad10b2422302dbe457bb6899f2e56cb7bb))
- **visio:** Create straight lines through shared drawing tools ([f67c10f](https://github.com/ChristopherVR/ooxml/commit/f67c10f3032f03e4c4b5b01f1caafe0395bb7af6))
- **docx:** Share independent inline comment anchors ([4397b4b](https://github.com/ChristopherVR/ooxml/commit/4397b4bf5629a7a9da21a34b286f01d2b0853136))
- **ui:** Embed teams settings in the workspace ([6b13bae](https://github.com/ChristopherVR/ooxml/commit/6b13bae9b7fbb62a320d088a66eacc52f00a9c44))
- **ui:** Refine shared files commands and sorting ([9372d61](https://github.com/ChristopherVR/ooxml/commit/9372d61fecf826888d184a48d3f3f1c063328174))
- **xlsx:** Format chart and plot background fills ([9237f7f](https://github.com/ChristopherVR/ooxml/commit/9237f7f2ec5851088a28d2af5ca82d02806f5438))
- **visio:** Create and resize native ellipses with shared logic ([6c4d008](https://github.com/ChristopherVR/ooxml/commit/6c4d00839469577dfff31a61e27150c7bd281c53))
- **xlsx:** Format and paint chart title and legend fills ([4255dcd](https://github.com/ChristopherVR/ooxml/commit/4255dcdee2fbf4c62ea9260ffcf3a9856ebb859b))
- **visio:** Rotate local shapes through shared editing ([c68e4f4](https://github.com/ChristopherVR/ooxml/commit/c68e4f471d9fdd2927bdb47a13c95b78c0bd706e))
- **visio:** Rotate shapes with shared pointer geometry ([407fa61](https://github.com/ChristopherVR/ooxml/commit/407fa614c7f919052d44d9e31f7abfbcfe6df50d))
- **visio:** Render live rotation previews through shared svg ([87c3957](https://github.com/ChristopherVR/ooxml/commit/87c3957b5967466db44cbc95b08f5cfff21d81a7))
- **visio:** Share native quarter-turn command preparation ([c342e79](https://github.com/ChristopherVR/ooxml/commit/c342e79b82930797a7bf3a16b89a3bbe86d0128e))
- **visio:** Add shared nested quarter-turn menus ([b1c7377](https://github.com/ChristopherVR/ooxml/commit/b1c737749e22e4340ea04ddd695ada3b5049dc33))
- **visio:** Flip local shapes through shared geometry edits ([cffd415](https://github.com/ChristopherVR/ooxml/commit/cffd415a9fd7a8866f3f07dae027850dccb17c82))
- **xlsx:** Wrap chart titles with shared text flow ([14a33ed](https://github.com/ChristopherVR/ooxml/commit/14a33ed2ee58f8469e5d24a0a36923a3922f23c4))

### Bug Fixes

- **docx:** Distinguish footnotes and endnotes with shared ids ([874ff3b](https://github.com/ChristopherVR/ooxml/commit/874ff3b325a0da5675c34786f14f68cc4e31bc1d))
- **visio:** Project oblique stroke gradients in physical bounds ([2a05f37](https://github.com/ChristopherVR/ooxml/commit/2a05f37fb9e7e2e7683d0566a2831cc0122360cf))
- **visio:** Project saved oblique fills through physical bounds ([938ceae](https://github.com/ChristopherVR/ooxml/commit/938ceae0aaa1a7db365f577f36550863757f3f8f))
- **chart:** Paint native rectangular path gradients ([af81015](https://github.com/ChristopherVR/ooxml/commit/af81015bca6823dc505c26c006b2a99eb2e85c8f))
- **docx:** Locate imported inline comment anchors ([7ecbe15](https://github.com/ChristopherVR/ooxml/commit/7ecbe15f2e9b25401316579ad35e855b5add6b90))
- **visio:** Preserve drawn line endpoints beyond paper edges ([6cc3708](https://github.com/ChristopherVR/ooxml/commit/6cc37087579742326cacec4b8b670b869c1ad48f))
- **docx:** Anchor comments to complete complex fields ([065cb5c](https://github.com/ChristopherVR/ooxml/commit/065cb5c1c8554e9cdbe7b61a807d9efff1ffc2de))
- **docx:** Undo comment records with their anchors ([c736fab](https://github.com/ChristopherVR/ooxml/commit/c736fabf6d76c7e5cf87f137745e7dc1ea21bdba))
- **docx:** Retain body edits during yjs settings updates ([62d3fbd](https://github.com/ChristopherVR/ooxml/commit/62d3fbd3a5b852cb78619f3006ec982e5bbc4230))
- **docx:** Retain complete simple field comment scopes ([30500ef](https://github.com/ChristopherVR/ooxml/commit/30500efc737d69b920530893bf4de24b629b1dd9))
- **visio:** Preserve drawn boxes beyond scaled paper edges ([0048416](https://github.com/ChristopherVR/ooxml/commit/0048416f0cca19f7d3888e4c71c1d1d09583792e))
- **docx:** Retain adjacent simple field boundaries ([9303f68](https://github.com/ChristopherVR/ooxml/commit/9303f68aab372012d833669aa4eb45ceffba7726))
- **docx:** Copy field results as formatted literal text ([797db1b](https://github.com/ChristopherVR/ooxml/commit/797db1ba8f8942b2b364833e6a065504486ceaac))
- **docx:** Retain simple fields during result replacements ([908c45e](https://github.com/ChristopherVR/ooxml/commit/908c45ea9da8bf6ca75b7a4faefab87db44711d4))
- **docx:** Preserve empty fields through deletion and review ([e3c06a7](https://github.com/ChristopherVR/ooxml/commit/e3c06a73632b21645ff6553ed85d5426bfe49e53))
- **docx:** Share field-aware deletion across clipboard paths ([408ecb8](https://github.com/ChristopherVR/ooxml/commit/408ecb8a12549b953777c3037074280110ddd017))
- **xlsx:** Measure chart title and legend text in the browser ([e74cf9e](https://github.com/ChristopherVR/ooxml/commit/e74cf9e85fec51ee29fee5c2ad9f892c38a1c12f))
- **xlsx:** Align chart title lines with measured font boxes ([8499a58](https://github.com/ChristopherVR/ooxml/commit/8499a584ea11a03cb25517f3d6dad3b16104b375))
- **ui:** Preserve feedback and history for blocked visio flips ([9feb751](https://github.com/ChristopherVR/ooxml/commit/9feb75113d0e0d3f01bf509bbe55d08ee46af7ce))
- **docx:** Remove incomplete field structure from clipboard ([1539bbc](https://github.com/ChristopherVR/ooxml/commit/1539bbc9a136a904aad1e3b73f59834ac195ccd8))
- **ui:** Avoid viewport scans when clearing visio handles ([091cc4f](https://github.com/ChristopherVR/ooxml/commit/091cc4f36a833e66d59a3465d75eac1623650427))
- **ui:** Refresh the published custom element manifest ([ac3acb6](https://github.com/ChristopherVR/ooxml/commit/ac3acb6ad7af6bbbfba5536b119367ecff1e78a1))
- **pptx:** Project rectangular chart gradients in every binding ([8bc5ee3](https://github.com/ChristopherVR/ooxml/commit/8bc5ee3be9584e37a251ae72701ed9d2d392448f))
- **ci:** Clear lint errors in chart and drawing checks ([f331e67](https://github.com/ChristopherVR/ooxml/commit/f331e670ca9c52a76e048648e55d0660d925f7c4))

## [0.31.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.31.0) - 2026-10-07

### Features

- **teams:** Add embedded content previews ([c127224](https://github.com/ChristopherVR/ooxml/commit/c127224861720dd2d37e24390f940e642588b559))
- **xlsx:** Repeat copied blocks across selected paste ranges ([ac0ce3d](https://github.com/ChristopherVR/ooxml/commit/ac0ce3dd50810162fb71b285ecd1cf3e90f3138a))
- **ui:** Share the PowerPoint colour picker palette ([1c4e1a1](https://github.com/ChristopherVR/ooxml/commit/1c4e1a10f235b4d9949e598922e18fc68a757258))
- **teams:** Add shared tabs and workbook save copies ([35d637a](https://github.com/ChristopherVR/ooxml/commit/35d637acf7cebeb1453d02bd4ac792690b5ae2c0))
- **visio:** Render native-sized open arrowheads ([aca53b5](https://github.com/ChristopherVR/ooxml/commit/aca53b5ab43e771b39ed3d4f2b07adc6163a1c7f))
- **visio:** Render native curved open arrowheads ([4576cf7](https://github.com/ChristopherVR/ooxml/commit/4576cf75cef7b031ae3b44b82b0ffc85ed8a7272))
- **xlsx:** Support combined paste special options ([725d97e](https://github.com/ChristopherVR/ooxml/commit/725d97e0dd0e3759813dead0a2cd12ee0f99ee35))
- **teams:** Create and upload channel workbooks ([caa8442](https://github.com/ChristopherVR/ooxml/commit/caa8442b4f76171c9a763999e44e58dec545ebe8))
- **visio:** Match native filled arrows on straight connectors ([e4a4c57](https://github.com/ChristopherVR/ooxml/commit/e4a4c57973c025cb79764d4cb41fac152c69bc8e))
- **xlsx:** Implement native paste arithmetic operations ([bc9f9ef](https://github.com/ChristopherVR/ooxml/commit/bc9f9efa06b439fd1a216d5de9040f0c19aae24d))
- **xlsx:** Support all except borders paste ([025bf20](https://github.com/ChristopherVR/ooxml/commit/025bf20f7f85140186c766006a4db25880828fda))
- **teams:** Preview powerpoint slides inside channels ([0be35e7](https://github.com/ChristopherVR/ooxml/commit/0be35e7b096190a46ab0d9323a6d3bb9b6862e04))
- **xlsx:** Implement column widths paste ([03cfd50](https://github.com/ChristopherVR/ooxml/commit/03cfd5047fcbcf8500e0662b6bab3b432b1f5d03))
- **pptx:** Migrate shared renderer and editing into core and ui ([ba4cd0d](https://github.com/ChristopherVR/ooxml/commit/ba4cd0dc64707ed32d4386c14b80b0ad8a50300a))
- **teams:** Download local workbook copies ([62211da](https://github.com/ChristopherVR/ooxml/commit/62211da7aa37784a744d4390878b5f16d0a19112))
- **xlsx:** Paste notes and validation rules ([eb51374](https://github.com/ChristopherVR/ooxml/commit/eb51374e6d7ed77a057bcc3274d7ef0bd6b936ee))
- **teams:** Cancel file transfers and report batch progress ([9147775](https://github.com/ChristopherVR/ooxml/commit/9147775d34bc2018fd56d7c039c8762c6fa5bf7f))
- **visio:** Insert source-backed pages with native reopen checks ([d6ccef6](https://github.com/ChristopherVR/ooxml/commit/d6ccef697508fe11e8ef79bc12e1f70f8a211bd1))
- **teams:** Cancel workbook copy saves without losing edits ([f991f12](https://github.com/ChristopherVR/ooxml/commit/f991f1234cace2026d037c1203e20e10712c05ac))
- **docx:** Add shared Yjs editor collaboration ([af0ec8e](https://github.com/ChristopherVR/ooxml/commit/af0ec8e5a7d47a31433f1c33943de9ae51144b61))
- **visio:** Reorder pages with stable selection and history ([935f3cb](https://github.com/ChristopherVR/ooxml/commit/935f3cbe213c83f6ae44730dc7ff01119dfdf561))
- **docx:** Flow continuous sections on a shared page ([1909ef3](https://github.com/ChristopherVR/ooxml/commit/1909ef3b5e4935bd8ff9bbba63b83b191efff92f))
- **teams:** Render markdown tables and task lists ([d3e9827](https://github.com/ChristopherVR/ooxml/commit/d3e9827b562cb7c5824361080468484ce20b1bf4))
- **xlsx:** Preserve conditional formats through clipboard operations ([91a856a](https://github.com/ChristopherVR/ooxml/commit/91a856ae3137b960472d0df713ddb95258c85af7))
- **teams:** Add focused channel thread conversations ([e260cca](https://github.com/ChristopherVR/ooxml/commit/e260ccac17474e7325546f71f06fab74e9474e80))
- **visio:** Rename pages with references and shared dialog ([a3154d0](https://github.com/ChristopherVR/ooxml/commit/a3154d0045a39c89c9d8f77020fb06ba0e393956))
- **teams:** Add personal followed thread navigation ([e19b0c1](https://github.com/ChristopherVR/ooxml/commit/e19b0c1d466c661d28c0d59fdb5dfbe50d95fc92))
- **teams:** Track unread followed thread activity ([711fed5](https://github.com/ChristopherVR/ooxml/commit/711fed5ba0e4fb5b29112e3aa65243a3d03eca11))
- **teams:** Automatically follow authored threads ([80b1f85](https://github.com/ChristopherVR/ooxml/commit/80b1f85459a9d5b653ac587702235adef02eed86))
- **xlsx:** Render linked data-bar appearance settings ([859552f](https://github.com/ChristopherVR/ooxml/commit/859552fb68dc3be9a2f84fde914f17f8c72a7078))
- **visio:** Delete pages with native cache and background handling ([e536c35](https://github.com/ChristopherVR/ooxml/commit/e536c3553ad87ccc4e35a1d2212ab65bb22e821f))
- **docx:** Synchronize comment threads through Yjs ([817c1cc](https://github.com/ChristopherVR/ooxml/commit/817c1ccbe3116aedb41cd4b41013ed8fff3064a2))
- **pptx:** Move snapshots and cached drawing bounds into core ([f13d837](https://github.com/ChristopherVR/ooxml/commit/f13d83743ce937b5b8c5c66d0abc130d78da8dbb))
- **teams:** Preserve personal message drafts across views ([3287056](https://github.com/ChristopherVR/ooxml/commit/328705692aad1cd99a9427a0823564d703e33011))
- **xlsx:** Calculate data-bar axes and signed lengths ([42cc6e7](https://github.com/ChristopherVR/ooxml/commit/42cc6e777d77c55318105d7cf51f6b730e855e43))
- **teams:** Recover and cancel chat attachment transfers ([36332c2](https://github.com/ChristopherVR/ooxml/commit/36332c23480f95d87a093d3cde906ff405ff8019))
- **docx:** Synchronize track changes recording ([2e49393](https://github.com/ChristopherVR/ooxml/commit/2e493931f821785829127c69cd133b9b360db680))
- **visio:** Apply native layer colors and classic linear fills ([72743c2](https://github.com/ChristopherVR/ooxml/commit/72743c20f450be8c3b9c3ed9fe2741dd554a3f89))
- **docx:** Share revision recording and resolution ([26c54cd](https://github.com/ChristopherVR/ooxml/commit/26c54cd5db2c8ed69547540ed4448c979357cde4))
- **teams:** Align shared files commands and list layout ([011bf5b](https://github.com/ChristopherVR/ooxml/commit/011bf5bec452e7746e7dd4dbb0db86d9bd31f754))
- **xlsx:** Reuse shared chart gallery and edit grouping ([9dc95e9](https://github.com/ChristopherVR/ooxml/commit/9dc95e9f5797ba62f0ce0cf929dbd88a941ad2ac))
- **teams:** Organize settings and save personal appearance ([c31c15c](https://github.com/ChristopherVR/ooxml/commit/c31c15c8e7e7ef99b99ef8757dcafd491316aef2))
- **ui:** Resolve smartart theme fonts and drawing colors ([9daa589](https://github.com/ChristopherVR/ooxml/commit/9daa589d8dddba52c810efead7d7314886b580fb))
- **visio:** Render native hatch fill tiles ([1bf7486](https://github.com/ChristopherVR/ooxml/commit/1bf7486161cb286f15ec0775bae7aa1cad1124d8))
- **docx:** Restore prior run properties on revision rejection ([9427440](https://github.com/ChristopherVR/ooxml/commit/94274409912976a358179ee79a16e3c5da9f88dc))
- **chart:** Share Office chart color palettes ([bd436dd](https://github.com/ChristopherVR/ooxml/commit/bd436dd9dc392805f84a2c483c67f09e424b2e5d))
- **teams:** Add file actions and browser viewer preferences ([781872c](https://github.com/ChristopherVR/ooxml/commit/781872cab23d53a2bf11add022710d37b13c3dea))
- **docx:** Resolve imported formatting in shared review commands ([5ced959](https://github.com/ChristopherVR/ooxml/commit/5ced9591c6687df7e4c1d9773eedd855212bb328))
- **teams:** Save chat density and flush posts before navigation ([fb4284a](https://github.com/ChristopherVR/ooxml/commit/fb4284a237f54ea03c498bbff2854742122cceb5))
- **docx:** Restore prior paragraph formatting on rejection ([4612ec0](https://github.com/ChristopherVR/ooxml/commit/4612ec06e7a5e5fa70cefb51e285a8113da5e5a0))
- **teams:** Align shell menus and profile status controls ([613e54e](https://github.com/ChristopherVR/ooxml/commit/613e54e3c06e6e36c1c652acfd02c4d64756f686))
- **docx:** Resolve paragraph formatting in shared review commands ([0221310](https://github.com/ChristopherVR/ooxml/commit/02213106c5aa9d17fb48c2b247032b15b2ccaf1d))
- **visio:** Preserve page hatch orientation and tile phase ([8b13665](https://github.com/ChristopherVR/ooxml/commit/8b13665ad715f703a983938b47c6b82ba87a6aee))
- **xlsx:** Add shared Change Colors gallery and native palette edits ([c0e42f0](https://github.com/ChristopherVR/ooxml/commit/c0e42f0b611371ffef7334fa950db5ce9a98cbdd))
- **docx:** Preserve script-specific fonts through tracked edits ([a698c3a](https://github.com/ChristopherVR/ooxml/commit/a698c3a85e60d6c0bf554ec2eb10d16096caee98))
- **visio:** Render native classic radial fills ([e26a6f5](https://github.com/ChristopherVR/ooxml/commit/e26a6f5e7464f3f37b940e36137e13531be55c7b))
- **teams:** Configure shared files through an add-tab dialog ([b39ada7](https://github.com/ChristopherVR/ooxml/commit/b39ada754ac19e542c710f3e785d188cdec4b570))
- **docx:** Preserve overlapping text and formatting revisions ([88582ed](https://github.com/ChristopherVR/ooxml/commit/88582ed132cd20ef1620f1b3c59904e8650eb34c))
- **visio:** Render native classic region gradients ([92b9251](https://github.com/ChristopherVR/ooxml/commit/92b92518ac72d67630cc961882a0eb64349f4aa5))
- **teams:** Search settings and save app label preferences ([3270b52](https://github.com/ChristopherVR/ooxml/commit/3270b52ab84058a6d2e0840087eb3501038be64c))
- **docx:** Retain opaque run properties through tracked text splits ([52d5e2a](https://github.com/ChristopherVR/ooxml/commit/52d5e2a80770f4e6de7f567ab15d7a7890c719bf))
- **visio:** Render saved oblique gradients in bounding boxes ([7194727](https://github.com/ChristopherVR/ooxml/commit/71947272d8d617a2c6ee21c6e76cda9861492c91))
- **xlsx:** Render imported native chart appearance ([c14f42d](https://github.com/ChristopherVR/ooxml/commit/c14f42d99db1aad93ff522a4436aab29606d52d6))
- **docx:** Record run formatting in shared track changes ([6536756](https://github.com/ChristopherVR/ooxml/commit/653675636cfab8f927f76f9fb242d83f9eba5558))
- **docx:** Honor formatting and move recording preferences ([98cb8e3](https://github.com/ChristopherVR/ooxml/commit/98cb8e365a792352a2123a52d57ad6fc5bdcfb1a))
- **teams:** Connect shared tabs to channel conversations ([9797022](https://github.com/ChristopherVR/ooxml/commit/9797022a4fb908b6ef1df57e29901eb53d9cc5ac))
- **teams:** Refine settings switches and panel scrolling ([0e10bc5](https://github.com/ChristopherVR/ooxml/commit/0e10bc55af35b1e206d957b31838f18bcd397938))
- **docx:** Retain paragraph property bases through review edits ([af2b24c](https://github.com/ChristopherVR/ooxml/commit/af2b24cfca36df8da11de71d9b6a62f0a76ba0de))
- **teams:** Restore compact channel navigation ([861c203](https://github.com/ChristopherVR/ooxml/commit/861c203a897f3f72917918a89a2b4eef8b135845))
- **docx:** Record paragraph formatting in shared track changes ([bddb5f9](https://github.com/ChristopherVR/ooxml/commit/bddb5f9f91a9555121b5a3361721caabf10cf800))
- **xlsx:** Render imported native chart shadows ([ab83de0](https://github.com/ChristopherVR/ooxml/commit/ab83de0bc39002955cf915922d4b027f13da760e))
- **docx:** Expose shared review recording preferences in a dialog ([ea73e60](https://github.com/ChristopherVR/ooxml/commit/ea73e603f0f791c183101c2b7be8e4347c066f1a))
- **teams:** Create channels through an in-app dialog ([65bc42f](https://github.com/ChristopherVR/ooxml/commit/65bc42fc7d5214784222e20db655c8cf872f1c39))
- **xlsx:** Honor native chart gap width and overlap ([42b7d63](https://github.com/ChristopherVR/ooxml/commit/42b7d63d9bd025ca0113b6f84c9f22ea37a986ab))
- **docx:** Project prior paragraph formatting in original review ([c7260b8](https://github.com/ChristopherVR/ooxml/commit/c7260b8d5330a7e1a8e0e851674b44bce5ce85bd))
- **xlsx:** Add docked chart series spacing controls ([19ef348](https://github.com/ChristopherVR/ooxml/commit/19ef348e76d5046170edd9e50bb496dbd094207f))
- **docx:** Project prior formatting in original print layout ([582b4da](https://github.com/ChristopherVR/ooxml/commit/582b4da5fdeadcbe1d50845e20055905be6edd56))
- **xlsx:** Reuse shared range controls for chart spacing ([6d3140b](https://github.com/ChristopherVR/ooxml/commit/6d3140bdcac9578361a127c5f93e1d7185638bb5))
- **docx:** Honor review text visibility in paginated layout ([7b3fe73](https://github.com/ChristopherVR/ooxml/commit/7b3fe735269caa92795129b66caa8aa748f32c65))
- **xlsx:** Edit individual chart series fills ([94c1f0f](https://github.com/ChristopherVR/ooxml/commit/94c1f0f820d6c01b055f5c37b4c63a740fa56ea1))
- **docx:** Render prior run formatting in original review ([89c698f](https://github.com/ChristopherVR/ooxml/commit/89c698f815cbe480fa437c744d0319686ce5b1e0))
- **teams:** Render PowerPoint files with the shared DOM viewer ([eff1672](https://github.com/ChristopherVR/ooxml/commit/eff167219c4ef50759f07e02f0b920095785b693))
- **xlsx:** Add solid chart fill transparency controls ([60f5c51](https://github.com/ChristopherVR/ooxml/commit/60f5c51fcc46e8edd48d0a25c9189113d7e799b1))
- **visio:** Render saved path fills with shared gradient paints ([e0b7ee9](https://github.com/ChristopherVR/ooxml/commit/e0b7ee9953329306029d2d584562267fdd59222e))
- **docx:** Project review formatting in story editing views ([8d4c40c](https://github.com/ChristopherVR/ooxml/commit/8d4c40cc4552a1a6713037d6ca79b35c428138f5))
- **teams:** Refine settings navigation and appearance previews ([e2cd399](https://github.com/ChristopherVR/ooxml/commit/e2cd3992b7406d06ab4fa0adc20aa5d0d202a68f))

### Bug Fixes

- **xlsx:** Preserve copied blanks and repeat directional fills ([6fc8f8d](https://github.com/ChristopherVR/ooxml/commit/6fc8f8df2275936c3c62ee6ea8317a9b463e5848))
- **xlsx:** Copy cells in every ribbon fill direction ([02adfb6](https://github.com/ChristopherVR/ooxml/commit/02adfb64a83f9149c5283dc81ca3d0c75ce0386f))
- **visio:** Match native short end-arrow stems ([3219c3f](https://github.com/ChristopherVR/ooxml/commit/3219c3fb03b21c4d1645d0e02887c8d6c7e0812b))
- **visio:** Normalize drawing scales to physical page inches ([0c320b5](https://github.com/ChristopherVR/ooxml/commit/0c320b50d6edda5ce6d9a7ccba4e1c300a06833b))
- **docx:** Retain page field restarts across continuous sections ([04cce34](https://github.com/ChristopherVR/ooxml/commit/04cce34d7d6ce56deffffb05f124169e207344bb))
- **docx:** Retain concurrent overlapping comment anchors ([b131720](https://github.com/ChristopherVR/ooxml/commit/b131720f41a19dc4f4ba1145a857bd8e428b48f6))
- **ui:** Refresh Teams thread custom element manifest ([eddc15b](https://github.com/ChristopherVR/ooxml/commit/eddc15bc9ccfc281efd3e31abeb51be7936a662d))
- **docx:** Export linked moves that native word can open ([3fda2d2](https://github.com/ChristopherVR/ooxml/commit/3fda2d2d9fe2af970aff28c76fdb96089db637a2))
- **docx:** Timestamp recorded text revisions ([d657580](https://github.com/ChristopherVR/ooxml/commit/d6575805a22a7e02172aab674299e2e43953474a))
- **docx:** Preserve tracked run formatting through text edits ([ecfde3c](https://github.com/ChristopherVR/ooxml/commit/ecfde3c526ce16a41246f1ec26b22fe0a1921463))
- **docx:** Preserve paragraph revision snapshots through text edits ([30d586d](https://github.com/ChristopherVR/ooxml/commit/30d586d1893090538aa45dfe8bc1f42652638071))
- **pptx:** Preserve combo chart formatting and table subscripts ([7518420](https://github.com/ChristopherVR/ooxml/commit/75184207b96f061a557f675ef061c4c9a838393a))
- **pptx:** Apply PowerPoint table cell spacing and margins ([c5feb77](https://github.com/ChristopherVR/ooxml/commit/c5feb77c3a8e7daec77c2575092e946a3614e5ef))
- **pptx:** Resolve chart text fonts across runs and scripts ([6d00580](https://github.com/ChristopherVR/ooxml/commit/6d00580398c698e2cf4140ed2f709883b29f475d))
- **pptx:** Include bullet text runs in paragraph strut sizing ([b10c8cd](https://github.com/ChristopherVR/ooxml/commit/b10c8cd89ae3ed4ee87cf1a38f7892928858bac1))
- **pptx:** Wrap Korean text at word boundaries ([cfa6b1d](https://github.com/ChristopherVR/ooxml/commit/cfa6b1d9d27b43685b6b5e1a6ef7cf7a63a73229))
- **teams:** Declare chat density spacing tokens ([e122287](https://github.com/ChristopherVR/ooxml/commit/e122287ef9960899b72792e38f89c37c265d3244))
- **docx:** Honor style page breaks and invalidate cached markers ([64d02c8](https://github.com/ChristopherVR/ooxml/commit/64d02c86d2205380c969fc4be3d06476901f9c65))
- **visio:** Report native gradient raster fidelity gaps ([f30a2e4](https://github.com/ChristopherVR/ooxml/commit/f30a2e42f3f3fe8f815c86cd88dc7ce028ddb0ce))
- **visio:** Reproduce native opaque gradient paint ([d6930d8](https://github.com/ChristopherVR/ooxml/commit/d6930d87fe0a3d8ddced21d66094e6d63776d042))
- **visio:** Remove transparent region fill seams ([562e07e](https://github.com/ChristopherVR/ooxml/commit/562e07e8bf41be7b23e3c27e6166c98af0a2a830))
- **docx:** Preserve and filter inline object revisions ([0125d83](https://github.com/ChristopherVR/ooxml/commit/0125d83a8fe243f663c6867d76e7ffd79390d3cc))

### Refactor

- **docx:** Share comment editing commands in core ([51ad69c](https://github.com/ChristopherVR/ooxml/commit/51ad69ccd3b61e2472bbee40fda65b3eaed43e3c))
- **visio:** Use extensionless relative source imports ([2495aa9](https://github.com/ChristopherVR/ooxml/commit/2495aa92d52a0135106695a2a39a72c9f98cf177))
- **docx:** Share mark-to-run formatting conversion ([cba7fb1](https://github.com/ChristopherVR/ooxml/commit/cba7fb1ce7733a3faf6c9e463124ae69a47f6835))
- Use extensionless relative typescript imports ([ef81f39](https://github.com/ChristopherVR/ooxml/commit/ef81f394cd2f275bcc9db87830db24b0adb2ec8b))
- **docx:** Share paragraph attribute conversion ([132ce8b](https://github.com/ChristopherVR/ooxml/commit/132ce8ba237a61bbe2dbc93a0d76f80da17b0c00))
- **pptx:** Share the DOM renderer for embedded viewers ([2e3219c](https://github.com/ChristopherVR/ooxml/commit/2e3219cff733e1f49094806119f3da78a50762ee))

## [0.30.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.30.1) - 2026-10-07

## [0.30.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.30.0) - 2026-10-06

### Features

- **ui:** Add the suite tab model and a tabbed launcher shell ([8ede628](https://github.com/ChristopherVR/ooxml/commit/8ede628c6421794f93ec281eeb7f0e163d574b14))
- **ui:** Pin and drag suite tabs, and give the top bar one brand mark ([0a30d8a](https://github.com/ChristopherVR/ooxml/commit/0a30d8a4974d53eddedd896cf01b1820cee4a223))

### Bug Fixes

- **xlsx:** Harden code-scanning findings across areas ([90ee4b3](https://github.com/ChristopherVR/ooxml/commit/90ee4b33e1253f21cd0df299af468d550f85eddc))
- **xlsx:** Use Reflect for dynamic property writes and tighten sanitizers ([b663413](https://github.com/ChristopherVR/ooxml/commit/b66341384d972d73182b06c6b4c706c0462f9364))

### Dependencies

- **deps:** Align emf-converter on 4.8.21 ([3c2859d](https://github.com/ChristopherVR/ooxml/commit/3c2859d0a43e66666015debaeaa985888727db95))

## [0.29.3](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.29.3) - 2026-10-06

### Refactor

- Make src/core a workspace package (by @ChristopherVR) ([d5b8d6d](https://github.com/ChristopherVR/ooxml/commit/d5b8d6d91161c9ae631aa84436afb35105ac9517))

## [0.29.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.29.2) - 2026-10-05

### Refactor

- Move ooxml-ui from packages/ui to src/ui (by @ChristopherVR) ([86901f3](https://github.com/ChristopherVR/ooxml/commit/86901f3edaf0d74363d06488bd8f5724be9f807e))
- Move the library into src/core, next to src/ui (by @ChristopherVR) ([3933a88](https://github.com/ChristopherVR/ooxml/commit/3933a88e36784ce5f4bfab0af1ca12eb65d3cd0c))

### Chores

- Merge the release commit into the restructure (by @ChristopherVR) ([efdb30a](https://github.com/ChristopherVR/ooxml/commit/efdb30a34873f71211e11a39f315b5dc3c3cd82c))

## [0.29.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.29.1) - 2026-10-05

### Bug Fixes

- **ui:** Keep the popup hook on a closed gallery's placeholder (by @ChristopherVR) ([44f0060](https://github.com/ChristopherVR/ooxml/commit/44f0060aca918d9153f608e7c0d4d9fa999cbb11))
- **ui:** Repaint the select trigger when aria-label changes (by @ChristopherVR) ([50c38ff](https://github.com/ChristopherVR/ooxml/commit/50c38ff583b52991aaec9a81b3241396c714d28a))
- **ui:** Repaint the select trigger when aria-label changes (by @ChristopherVR) ([4a17d1c](https://github.com/ChristopherVR/ooxml/commit/4a17d1c2c5291f2b56057443151fba69ce072871))
- **ui:** Keep Tab inside the open File view and let F6 reach the status bar (by @ChristopherVR) ([7930c2a](https://github.com/ChristopherVR/ooxml/commit/7930c2ad2114a31652c3dc5966f56f81336e0579))

## [0.29.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.29.0) - 2026-10-05

### Features

- **ui:** Export the visio demo document from ooxml-ui/visio (by @ChristopherVR) ([0ea4098](https://github.com/ChristopherVR/ooxml/commit/0ea4098b294361f98b244788f3c833427bc3fe22))

## [0.28.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.28.0) - 2026-10-05

### Features

- **ui:** Move the xlsx editor element into ooxml-ui/xlsx (by @ChristopherVR) ([cdf0be0](https://github.com/ChristopherVR/ooxml/commit/cdf0be0f8f106deb356ddaca6a797ed0f0b1ec71))
- **ui:** Move the docx editor element into ooxml-ui/docx (by @ChristopherVR) ([680cc07](https://github.com/ChristopherVR/ooxml/commit/680cc07b085729b9d9b6e2fed65133ff275805da))
- **ui:** Move the visio viewer and the teams app into ooxml-ui (by @ChristopherVR) ([2b8605a](https://github.com/ChristopherVR/ooxml/commit/2b8605a4bcf750ecc84758091160ca9b7f490b1d))
- **xlsx:** Move the DOM-free editor logic into core (by @ChristopherVR) ([d6c6be1](https://github.com/ChristopherVR/ooxml/commit/d6c6be13ec5a1aa5826ca810a8a98b020d5c0878))
- **docx:** Move the DOM-free editor modules into core (by @ChristopherVR) ([e3bd270](https://github.com/ChristopherVR/ooxml/commit/e3bd2705501d0d30c715878ff2da87ff407fb961))
- **visio:** Move the DOM-free viewer modules into core (by @ChristopherVR) ([956cb90](https://github.com/ChristopherVR/ooxml/commit/956cb90371477a2e97e9036caf6f7b562d2a598b))

### Chores

- Lint with oxlint and pin oxfmt (by @ChristopherVR) ([e6e9aad](https://github.com/ChristopherVR/ooxml/commit/e6e9aade4bd74b3587acb80bd341b3e9505caf0b))

## [0.27.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.27.2) - 2026-10-05

## [0.27.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.27.1) - 2026-10-05

## [0.27.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.27.0) - 2026-10-05

### Features

- **ui:** Share KeyTip assignment and badges between products (by @ChristopherVR) ([5204d67](https://github.com/ChristopherVR/ooxml/commit/5204d676299c743b3aff21cceeb6ab1eb5fb0888))

## [0.26.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.26.0) - 2026-10-05

### Features

- **ui:** Publish a Custom Elements Manifest (by @ChristopherVR) ([2b00265](https://github.com/ChristopherVR/ooxml/commit/2b002654a786c6f1eb945e2ad2d19ab304d85e48))
- **ui:** Let KeyTips start and stop from code (by @ChristopherVR) ([88d8016](https://github.com/ChristopherVR/ooxml/commit/88d8016a9d7f2205471a71fb0e4465d51723f70a))
- **ui:** Tint the tab of a contextual ribbon panel (by @ChristopherVR) ([5e5d75c](https://github.com/ChristopherVR/ooxml/commit/5e5d75c115c4d626d59f046b2b3567c2345c4309))
- **ui:** Let a ribbon hide tabs by reason and expose its tab buttons (by @ChristopherVR) ([ba38042](https://github.com/ChristopherVR/ooxml/commit/ba38042dd99b26cd2c6d4f1183b3e1b5badd9789))
- **ui:** Add collapse and peek to the ribbon (by @ChristopherVR) ([4b187a0](https://github.com/ChristopherVR/ooxml/commit/4b187a06137caf760ded1c0ce86a970b2314eb50))
- **ui:** Share the ribbon overflow folding between products (by @ChristopherVR) ([c0a5aab](https://github.com/ChristopherVR/ooxml/commit/c0a5aab96b2fe533c531e3edcb4feb0ba5d9c013))

### Bug Fixes

- **ui:** Keep the manifest tooling out of the declaration build (by @ChristopherVR) ([4d2499f](https://github.com/ChristopherVR/ooxml/commit/4d2499fea7f523c507ea558bd570805555b0f283))
- **ui:** Read the Custom Elements Manifest in the package smoke test (by @ChristopherVR) ([15094ec](https://github.com/ChristopherVR/ooxml/commit/15094ecfe9fb69241d834932c2fd185668df193e))

## [0.25.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.25.0) - 2026-10-05

### Features

- **ui:** Let a ribbon panel hide its tab with data-tab-hidden (by @ChristopherVR) ([3bd9325](https://github.com/ChristopherVR/ooxml/commit/3bd9325e920e8049774a4b0894a7736ec244cdaf))
- **ui:** Add an actions slot to the title bar (by @ChristopherVR) ([65f1fea](https://github.com/ChristopherVR/ooxml/commit/65f1feac6dcb5cf7200247cfff28180c2bb36d38))

## [0.24.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.24.0) - 2026-10-04

### Features

- **ui:** Let products name the dialog close button (by @ChristopherVR) ([741bdcc](https://github.com/ChristopherVR/ooxml/commit/741bdcc2966d7ee1ad0718b96e49cacdbd44f8e5))
- **ui:** Let a status-bar button be disabled (by @ChristopherVR) ([2061ac6](https://github.com/ChristopherVR/ooxml/commit/2061ac613333a02f1eda16643c8cdb988832c29f))

## [0.23.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.23.0) - 2026-10-04

### Features

- **ui:** Show a shortcut hint on controlled context-menu rows (by @ChristopherVR) ([b3fd10a](https://github.com/ChristopherVR/ooxml/commit/b3fd10a2e1ed09addae70244c26d63dfb2fe3339))

## [0.22.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.22.0) - 2026-10-04

### Features

- **ui:** Let controlled context-menu rows carry a tooltip (by @ChristopherVR) ([c4af213](https://github.com/ChristopherVR/ooxml/commit/c4af213d78042caa52c5799be8457241e79524c4))
- **ui:** Let products name the zoom slider buttons and range (by @ChristopherVR) ([5beb442](https://github.com/ChristopherVR/ooxml/commit/5beb44256cd5129594ff4b9c82b1c9546cf9ca42))

## [0.21.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.21.0) - 2026-10-04

### Features

- **teams:** Add the team-workspace logic area (by @ChristopherVR) ([c3cca75](https://github.com/ChristopherVR/ooxml/commit/c3cca752c7833b1e1f318c0c67287c5d0bff3a9e))
- **ui:** Build every element as a Lit class with a sibling stylesheet (by @ChristopherVR) ([9e64958](https://github.com/ChristopherVR/ooxml/commit/9e6495863fbd50fb4be5e15dd1f3322bcab74e39))

### Bug Fixes

- **ui:** Keep attribute-only inputs and the popup contract of the viewers (by @ChristopherVR) ([21dcd34](https://github.com/ChristopherVR/ooxml/commit/21dcd34580d74fd1be06dc654b9a024522c7018d))
- **ui:** Give the gallery a slot for its light-DOM tiles (by @ChristopherVR) ([829270a](https://github.com/ChristopherVR/ooxml/commit/829270a845229b82f0bc00b067142de3d30d3813))
- **ui:** Render detached elements safely and keep subclass accessors out of Lit (by @ChristopherVR) ([36bcb29](https://github.com/ChristopherVR/ooxml/commit/36bcb296d565dde79a57c9cfb0d13b01cf78b7b1))

### Dependencies

- **deps:** Update all dependencies (by @ChristopherVR) ([d13b03a](https://github.com/ChristopherVR/ooxml/commit/d13b03ad9cb10c74655d699e7799d11aca4b30a0))

## [0.20.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.20.0) - 2026-10-04

### Features

- **ui:** Add the shared office-ui-gallery (by @ChristopherVR) ([720030d](https://github.com/ChristopherVR/ooxml/commit/720030d9ffbb9b0e45a6f1f96ed6739c4645dbd2))

## [0.19.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.19.0) - 2026-10-04

### Features

- **ui:** Add the shared office-ui-ribbon-section (by @ChristopherVR) ([8224de3](https://github.com/ChristopherVR/ooxml/commit/8224de33d6c945c112ce605ee6647f7e4c5dbff3))

## [0.18.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.18.2) - 2026-10-04

### Bug Fixes

- **ui:** Keep unchanged icon paths so a pressed button still clicks (by @ChristopherVR) ([aa9a613](https://github.com/ChristopherVR/ooxml/commit/aa9a6135067a7889464a0236763e9a566757187c))

## [0.18.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.18.1) - 2026-10-04

### Bug Fixes

- **ui:** Keep status bar clusters named while hidden (by @ChristopherVR) ([a60a0cf](https://github.com/ChristopherVR/ooxml/commit/a60a0cfef12cdaf131dfe19365b00583c22249d6))

## [0.18.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.18.0) - 2026-10-04

### Features

- **ui:** Add a controlled mode to office-ui-status-bar (by @ChristopherVR) ([cd96bb5](https://github.com/ChristopherVR/ooxml/commit/cd96bb55d407d2f5b8d95b80bda36ee33f68c005))

## [0.17.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.17.0) - 2026-10-04

### Features

- **ui:** Add the shared office-ui-title-bar (by @ChristopherVR) ([f0468b5](https://github.com/ChristopherVR/ooxml/commit/f0468b5e09291780b3b76246b468a86540bb8a51))

## [0.16.3](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.16.3) - 2026-10-04

### Bug Fixes

- **ui:** Draw a real switch knob and keep title bar search focus (by @ChristopherVR) ([1a28afd](https://github.com/ChristopherVR/ooxml/commit/1a28afd6a3dd867ed058c7141906184d2f4790bb))

## [0.16.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.16.2) - 2026-10-04

### Bug Fixes

- **ui:** Read an empty string as true in boolean properties (by @ChristopherVR) ([236cdce](https://github.com/ChristopherVR/ooxml/commit/236cdce367e911c8a826e0299e3e7048a59d8e81))

## [0.16.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.16.1) - 2026-10-04

### Bug Fixes

- **ui:** Keep internal fields out of framework property assignment (by @ChristopherVR) ([f66b5aa](https://github.com/ChristopherVR/ooxml/commit/f66b5aa7ef381144a64f67dd076df78faa83e1c8))

## [0.16.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.16.0) - 2026-10-04

### Features

- **ui:** Merge the controlled pptx context menu and load from require (by @ChristopherVR) ([213083b](https://github.com/ChristopherVR/ooxml/commit/213083bb83bff467445f920057053c606add99e7))

## [0.15.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.15.0) - 2026-10-03

### Features

- **ui:** Add ribbon command sizes, badges and group collapse (by @ChristopherVR) ([dbfb89e](https://github.com/ChristopherVR/ooxml/commit/dbfb89ecbd16b382642b349f33b2cb336c86985f))

## [0.14.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.14.0) - 2026-10-03

### Features

- **ui:** Move the declarative select from pptx-viewer (by @ChristopherVR) ([5e90b46](https://github.com/ChristopherVR/ooxml/commit/5e90b46c6a87c11e9a2485a8899b79275d2ef0a4))

## [0.13.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.13.0) - 2026-10-03

### Features

- **ui:** Make every control token based (by @ChristopherVR) ([5658df9](https://github.com/ChristopherVR/ooxml/commit/5658df98344d074ae10a247be19e296049edec3f))

## [0.12.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.12.0) - 2026-10-03

### Features

- **ui:** Expose checkbox and switch metrics as tokens (by @ChristopherVR) ([778431c](https://github.com/ChristopherVR/ooxml/commit/778431c1d9119d198cda35ecce03d3419a95ed05))

## [0.11.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.11.0) - 2026-10-03

### Features

- **ui:** Move shared office chrome controls from pptx-viewer (by @ChristopherVR) ([4fd820e](https://github.com/ChristopherVR/ooxml/commit/4fd820e06f2ca740532ea55678dd429d9584b874))

## [0.10.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.10.2) - 2026-10-03

### Bug Fixes

- **ui:** Stack backstage items in one column (by @ChristopherVR) ([23fd1cb](https://github.com/ChristopherVR/ooxml/commit/23fd1cb2e9ff3eccfc29b40c41e9599585a35f9b))

## [0.10.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.10.1) - 2026-10-03

### Bug Fixes

- **ui:** Step ribbon tabs from the focused tab (by @ChristopherVR) ([efe1a96](https://github.com/ChristopherVR/ooxml/commit/efe1a96934b699b0d37d69a2ea756ccbdbc16a26))

## [0.10.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.10.0) - 2026-10-03

### Features

- **ui:** Add office ribbon, backstage, find bar, ruler and print preview (by @ChristopherVR) ([c7d47f5](https://github.com/ChristopherVR/ooxml/commit/c7d47f545876c793d2fc965f8db252f172bc1d5c))

## [0.9.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.9.1) - 2026-10-03

## [0.9.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.9.0) - 2026-10-03

### Features

- **ui:** Add office options dialog and account profile (by @ChristopherVR) ([7c75493](https://github.com/ChristopherVR/ooxml/commit/7c75493d55743d0adbb466377f94f4115bee42c4))

## [0.8.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.8.0) - 2026-10-03

### Features

- **ui:** Add office keytips for keyboard ribbon access (by @ChristopherVR) ([29fbada](https://github.com/ChristopherVR/ooxml/commit/29fbadadf4843f3f9ccdfea944dcf9d41c19cf9c))

## [0.7.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.7.0) - 2026-10-03

### Features

- **ui:** Rank tell me results and show where commands live (by @ChristopherVR) ([1f2284e](https://github.com/ChristopherVR/ooxml/commit/1f2284eb47c579f4c417b0dda29a2055c506df99))

## [0.6.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.6.0) - 2026-10-03

### Features

- **ui:** Add office tell me command search (by @ChristopherVR) ([1b0db43](https://github.com/ChristopherVR/ooxml/commit/1b0db4335dcde1a74995c6ca19810db4df2337dd))

## [0.5.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.5.0) - 2026-10-03

### Features

- **ui:** Add context menu, menu separator and tab strip add button (by @ChristopherVR) ([69b3cb4](https://github.com/ChristopherVR/ooxml/commit/69b3cb4fd38e175ec1f34b64a3c190b755678d35))

## [0.4.1](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.4.1) - 2026-10-03

## [0.4.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.4.0) - 2026-10-03

### Features

- **ui:** Add icon-only menu buttons and keep menus on screen (by @ChristopherVR) ([410d508](https://github.com/ChristopherVR/ooxml/commit/410d50801b39e52dd90c3a4bc9158127d8e9497d))

## [0.3.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.3.0) - 2026-10-03

### Features

- **ui:** Add menu button, ribbon stack, launcher and office glyphs (by @ChristopherVR) ([83c8341](https://github.com/ChristopherVR/ooxml/commit/83c8341f39fdd7fdd1574954627340a5b8f3f752))

## [0.2.0](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.2.0) - 2026-10-03

### Features

- **ui:** Add zoom slider and document tab strip controls (by @ChristopherVR) ([9842596](https://github.com/ChristopherVR/ooxml/commit/98425968ba4d10ecca756e34aa8e21fb5618a0c8))

## [0.1.12](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.12) - 2026-10-03

## [0.1.11](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.11) - 2026-10-03

### Documentation

- **packages:** Align npm readmes with powerpoint structure (by @ChristopherVR) ([52d33d4](https://github.com/ChristopherVR/ooxml/commit/52d33d4c58f4cfac7e47df3c890168ca8542752b))

## [0.1.10](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.10) - 2026-10-03

### Chores

- **style:** Format existing docs and package configuration (by @ChristopherVR) ([09a7466](https://github.com/ChristopherVR/ooxml/commit/09a7466e8289e8f1cd0165e7830138f73b93fcf2))

## [0.1.9](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.9) - 2026-10-03

## [0.1.8](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.8) - 2026-10-03

## [0.1.7](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.7) - 2026-10-03

## [0.1.6](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.6) - 2026-10-03

## [0.1.5](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.5) - 2026-10-03

## [0.1.4](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.4) - 2026-10-03

## [0.1.3](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.3) - 2026-10-02

## [0.1.2](https://github.com/ChristopherVR/ooxml/releases/tag/ooxml-ui@0.1.2) - 2026-10-02

## [0.1.0](https://github.com/ChristopherVR/ooxml-core/releases/tag/@christophervr/office-ui@0.1.0) - 2026-10-01

### Features

- **ui:** Add the first office-ui controls, theme, presence and SmartArt (by @ChristopherVR) ([357f7ba](https://github.com/ChristopherVR/ooxml-core/commit/357f7bafc298d6a32727d29a82a8c6a6b441a85d))

### Bug Fixes

- **ci:** Keep the UI's core range stable so releases can install (by @ChristopherVR) ([70b3cea](https://github.com/ChristopherVR/ooxml-core/commit/70b3cea8c0715996275a775c42f1a9b8eadd72bb))

### Chores

- **ui:** Scaffold the @christophervr/office-ui workspace package (by @ChristopherVR) ([6bb6ddd](https://github.com/ChristopherVR/ooxml-core/commit/6bb6ddd0e1bd3594996810639232070239b225a4))
