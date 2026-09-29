# Contributing

Issues and pull requests are welcome. Keep changes small and say what behaviour
they change; a persona or target file for an application we have not seen is as
useful as code.

Before opening a pull request:

```sh
npm ci
npm run lint
npm run typecheck
npm run format:check
npm test
```

Unit tests live beside the code (`src/**/*.test.ts`, `node:test`). Nothing in CI
touches a browser or the Jev API; run a real persona against a real target and put
the report in the pull request when the change affects how the persona drives.

Threshold changes need calibration data: a run where the old cut was wrong, with
the step files showing it.
