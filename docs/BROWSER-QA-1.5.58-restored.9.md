# Browser QA — 1.5.58-restored.9

Executed with Playwright + Chromium at 1366×768 against the release source after bundling the local ES modules into the browser test page (the sandbox blocks direct localhost navigation).

Passed checks:
- App initialized with no page errors or console errors.
- Point-click then endpoint-drag live preview and finalization for line, Arrow 1 and spline; both endpoint markers are visible before mouse release.
- Dimension default is 2.5 mm.
- Uploaded `Лаб4-КушвидО-Актуальный-файл-Kompas.kcad` is staged into the file list; active document name is unchanged until explicit Open.
- Opening the imported project renders all 32 objects. Five dimensions retain their measurement records and use 2.5 mm text height; text annotation remains present.
- Exported project downloaded as `.kcad`, then re-imported as a second library item without replacing the open project.
- Separate `lab8-a3-landscape-template` forces 420×297 mm even if the format selectors are manually set to A4 portrait.
- Ukrainian title-block labels and author/checker names appear; every template stroke inspected is black (`rgb(17, 17, 17)`).

`npm test` passes: syntax checks, geometry/spline, history, real uploaded Kompas file conversion and round-trip, templates, HTML/app contract, server MIME, operations and viewport.
