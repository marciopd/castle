# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Castle is a Yarn-workspaces / Lerna monorepo built around [kafkajs](https://github.com/tulios/kafkajs), adding transparent [Confluent Schema Registry](https://www.confluent.io/confluent-schema-registry/) support and a middleware-based framework for producing/consuming Kafka messages with statically-typed, Avro-schema-verified payloads. All packages publish to npm under `@ovotech/*`.

Packages (`packages/*`):

- **`castle`** — core service framework: `createCastle`, `produce`, `consumeEachMessage`, `consumeEachBatch`, middleware system.
- **`castle-cli`** — CLI (`castle`) for interacting with Kafka topics, consumer groups, schemas, and connection configs.
- **`castle-stream`** — a `castle`-compatible consumer that reads from a Node stream instead of Kafka (used for backfills).
- **`avro-kafkajs`** — wraps `kafkajs` to transparently encode/decode messages via Schema Registry (`AvroKafka`, `AvroProducer`, `AvroConsumer`, `SchemaRegistry`). `castle` is built on top of this.
- **`avro-ts`** — generates TypeScript interfaces from Avro schemas (library, no CLI deps).
- **`avro-ts-cli`** — CLI wrapper around `avro-ts`.
- **`avro-decimal`**, **`avro-epoch-days`**, **`avro-timestamp-millis`** — Avro logical-type implementations (decimal-as-bytes, date-as-epoch-days, date-as-epoch-millis).
- **`blaise`** — mock generator helpers for Castle payloads, used with `@ovotech/avro-mock-generator`.
- **`build-docs`** — internal tool that generates each package's `README.md` from a template, transcluding source files via `> [path/to/file.ts]` markers (run with `yarn build:docs` in a package, or at the root for the top-level README).

## Commands

Run from the repo root unless noted. `yarn <script>` at the root uses `lerna run <script>` to fan out to every package.

```bash
yarn install         # install all workspace packages
yarn build            # tsc build every package (dist/ + .d.ts)
yarn test             # test every package
yarn lint             # prettier + eslint every package
```

Per-package (`cd packages/<name>`), the common scripts are:

```bash
yarn test             # jest --runInBand (some packages also typecheck generated code first)
yarn lint:prettier     # prettier --list-different
yarn lint:eslint       # eslint '{src,test}/**/*.ts'
yarn build             # tsc --outDir dist --declaration
```

Run a single test file/case with jest directly, e.g.:

```bash
cd packages/avro-ts
npx jest test/integration.spec.ts --runInBand
npx jest -t "Should convert BalanceAdjustment.avsc successfully"
```

`avro-ts` additionally runs `test:ts`, which compiles `test/integration.ts` (expected to typecheck cleanly) and `test/integration-should-fail.ts` (expected to **fail** typechecking) directly with `tsc --strict --noEmit`, to verify the interfaces it generates are actually correct TypeScript. Its `package.json` script uses `! tsc ...` shell negation for the second half — this only works under a POSIX shell (bash/sh); on Windows it must be run via Git Bash, not `cmd.exe`/PowerShell directly, or the two `tsc` invocations run manually.

### Integration tests requiring live services

`docker-compose.yaml` provides a local Kafka broker, Zookeeper, Schema Registry, and Postgres. Tests in `avro-kafkajs`, `castle`, `castle-cli`, and `castle-stream` that talk to a real broker/registry (`test/*integration*.spec.ts`, `test/class.spec.ts`, `test/functions.spec.ts`, `test/lifecycle.spec.ts`) need `docker-compose up` first and will fail with `ECONNREFUSED`/`KafkaJSConnectionError` otherwise — that failure mode does not indicate a code problem.

## Architecture

### Monorepo mechanics

- Yarn workspaces (`packages/*`) + Lerna 8 for cross-package script orchestration and publishing (auto-published on merge to `main`; version numbers must be bumped manually per package).
- All packages currently share one `typescript` version (kept in sync deliberately — see below) and one root `tsconfig.json` that each package's own `tsconfig.json` extends.
- Jest config is shared via the root `jest.json`, referenced as `"jest": { "preset": "../../jest.json" }` in each package.

### `avro-ts`: Avro schema → TypeScript, and its runtime `typescript`-instance coupling

`avro-ts` doesn't just typecheck at build time — it uses the `typescript` compiler API **at runtime** to build and print an AST (`src/convert.ts` walks the Avro schema and dispatches into `src/types/*.ts` per Avro type, using `@ovotech/ts-compose` — an external `ts.factory` wrapper — to construct nodes, then `printDocument` to render them to source text). This is why `typescript` is a `dependency` of `avro-ts`, not a `devDependency`.

`@ovotech/ts-compose` declares its own `typescript` dependency, separate from `avro-ts`'s. A package manager can end up installing two different `typescript` module instances (one hoisted for `avro-ts`, one nested inside `@ovotech/ts-compose`'s own `node_modules`). This matters a lot: a node's `.kind` (and everything else about it) is only meaningful relative to the `SyntaxKind` enum of the *specific* `typescript` instance that built it — values shift between versions — so nodes must never be built with one instance and printed/inspected with another. `src/ts-runtime.ts` resolves the exact `typescript` instance `@ovotech/ts-compose` itself uses internally (via `require.resolve` with `paths`) and every other file that touches `ts.*` at runtime (`convert.ts`, `ts-compose-compat.ts`) imports through it instead of importing `typescript` directly. `src/ts-compose-compat.ts` also monkey-patches the handful of `@ovotech/ts-compose` node-builder functions that are still written for TypeScript ≤4.x's factory API (pre-5.0, before `decorators` was merged into `modifiers`) — but only when the resolved instance actually needs it, so it's a no-op against an older, self-consistent `@ovotech/ts-compose`/`typescript` pairing.

### `castle`: middleware-based consumer/producer framework

`createCastle(config)` builds an `AvroKafka` (from `avro-kafkajs`) and wires up producers/consumers (`src/castle.ts`). Consumers/producers are plain functions: `produce<T>({ topic, schema })` returns a sender, `consumeEachMessage`/`consumeEachBatch` wrap a handler with the right payload type. Cross-cutting behavior (logging, etc.) is layered on via `Middleware` (`src/middlewares/`), not baked into `castle.ts` itself. `each-sized-batch.ts` adapts a `maxBatchSize`-based handler onto kafkajs's `eachBatch`.
