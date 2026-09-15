/**
 * The exact `typescript` module instance that `@ovotech/ts-compose` resolves
 * internally. A node's `.kind` (and every other property built by `ts.factory.*`) is
 * only meaningful relative to the `SyntaxKind` enum of the specific `typescript`
 * instance that produced it - `SyntaxKind` member values shift between versions (e.g.
 * `TypeReference` is `180` in TypeScript 4.9 but `184` in 5.9). A package manager can
 * install a different `typescript` version for `avro-ts` itself than the one
 * `@ovotech/ts-compose` pulls in as its own dependency, so anything in `avro-ts` that
 * builds or inspects nodes produced by `@ovotech/ts-compose` at runtime must go through
 * this same resolved instance, not a separately-imported one.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ts: typeof import('typescript') = require(require.resolve('typescript', {
  paths: [require.resolve('@ovotech/ts-compose')],
}));

export default ts;
