/**
 * `@ovotech/ts-compose` declares its own `typescript` dependency (currently `^4.8.3`,
 * even in its latest `0.21.0` release), separate from `avro-ts`'s own `typescript`
 * dependency. Depending on how a package manager resolves this, `@ovotech/ts-compose`
 * can end up using its own, differently-versioned `typescript` module instance
 * internally (for `printDocument` / `printNode` / `addJSDoc`) than the one `avro-ts`
 * itself resolves. AST nodes built with one `typescript` instance are not safe to hand
 * to a *different* instance's printer - it breaks even for plain nodes with no
 * comments, because each instance keeps its own internal node bookkeeping. So this
 * module always builds nodes using the exact same `typescript` instance that
 * `@ovotech/ts-compose` resolves internally, whatever that turns out to be.
 *
 * TypeScript 5 also merged the separate `decorators` parameter of several
 * `ts.factory.createXxxDeclaration` functions into `modifiers`. `@ovotech/ts-compose`
 * never accounted for this: if the instance it resolves is TypeScript 5+, several of
 * its `Node` / `Type` builders silently shift every argument by one position instead of
 * raising a type error. This patches exactly those members in place with corrected
 * implementations - but only when the resolved instance actually needs it, leaving
 * `@ovotech/ts-compose`'s own (already-correct, for an older instance) implementations
 * alone otherwise.
 */
import { Node, Type, addJSDoc } from '@ovotech/ts-compose';
import ts from './ts-runtime';

const needsModifiersArgFix = Number(ts.versionMajorMinor.split('.')[0]) >= 5;

if (needsModifiersArgFix) {
  const withJSDoc = <T extends import('typescript').Node>(doc: string | undefined, node: T): T =>
    doc === undefined ? node : addJSDoc(node, doc);

  Node.Enum = ({ name, members, isExport, isDefault, jsDoc }) =>
    withJSDoc(jsDoc, ts.factory.createEnumDeclaration(Type.Export(isExport, isDefault), name, members));

  Node.NamespaceBlock = ({ name, block, isExport, isDefault, jsDoc }) =>
    withJSDoc(
      jsDoc,
      ts.factory.createModuleDeclaration(
        Type.Export(isExport, isDefault),
        ts.factory.createIdentifier(name),
        ts.factory.createModuleBlock(block),
        ts.NodeFlags.Namespace,
      ),
    );

  Node.Import = ({ named, allAs, defaultAs, module }) =>
    ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        defaultAs ? Node.Identifier(defaultAs) : undefined,
        named
          ? ts.factory.createNamedImports(
              named.map((item) =>
                ts.factory.createImportSpecifier(
                  false,
                  item.as ? Node.Identifier(item.name) : undefined,
                  item.as ? Node.Identifier(item.as) : Node.Identifier(item.name),
                ),
              ),
            )
          : allAs
          ? ts.factory.createNamespaceImport(Node.Identifier(allAs))
          : undefined,
      ),
      ts.factory.createStringLiteral(module),
    );

  Type.Interface = ({ name, props = [], index, typeArgs, ext, isExport, isDefault, jsDoc }) =>
    withJSDoc(
      jsDoc,
      ts.factory.createInterfaceDeclaration(
        Type.Export(isExport, isDefault),
        name,
        typeArgs,
        ext
          ? [ts.factory.createHeritageClause(ts.SyntaxKind.ExtendsKeyword, ext.map(Type.TypeExpression))]
          : undefined,
        [...props, ...(index ? [index] : [])],
      ),
    );

  Type.Alias = ({ name, type, typeArgs, isExport, isDefault, jsDoc }) =>
    withJSDoc(jsDoc, ts.factory.createTypeAliasDeclaration(Type.Export(isExport, isDefault), name, typeArgs, type));

  Type.Param = ({ name, type, isOptional, isReadonly }) =>
    ts.factory.createParameterDeclaration(
      Type.Readonly(isReadonly),
      undefined,
      name,
      Type.Optional(isOptional),
      type,
      undefined,
    );

  Type.Index = ({ name, nameType, type, isReadonly }) =>
    ts.factory.createIndexSignature(Type.Readonly(isReadonly), [Type.Param({ name, type: nameType })], type);
}
