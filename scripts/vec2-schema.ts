#!/usr/bin/env bun
/**
 * Generates the vec2 operation schema from the TypeScript source.
 *
 * TypeScript keeps no parameter names or types at runtime, so the schema is extracted at build time
 * with the compiler API and committed:
 * - packages/vec2/schema/vec2.schema.json: every recordable class member and operation function,
 *   with parameter names, JSON type descriptions and return types;
 * - packages/vec2/schema/bindings.ts: the runtime table from class / function name to implementation;
 * - packages/vec2/schema/ids.ts: the operation ids as a string union, so policy.ts is type-checked.
 *
 *   bun run schema          # regenerate
 *   bun run schema:check    # fail when the committed files are stale
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import ts from 'typescript';
import { policy } from '../packages/vec2/schema/policy';
import type { OperationKind, OperationSchema, ParamSchema, TypeRef, Vec2Schema } from '../packages/vec2/schema/types';

const repoRoot = path.resolve(import.meta.dir, '..');
const packageRoot = path.join(repoRoot, 'packages/vec2');
const srcRoot = path.join(packageRoot, 'src');
const schemaDir = path.join(packageRoot, 'schema');

/** Folders whose exported functions are operations; classes are collected from every folder. */
const FUNCTION_FOLDERS = ['operations/'];
/** Never part of the schema: the recording layer itself. */
const SKIPPED_FOLDERS = ['recording/'];

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [full] : [];
  });
}

const moduleOf = (file: string) => path.relative(srcRoot, file).replace(/\\/g, '/').replace(/\.ts$/, '');

export function generateSchema(): { schema: Vec2Schema; bindings: string; ids: string } {
  const files = listSources(srcRoot).filter((file) => !SKIPPED_FOLDERS.some((dir) => moduleOf(file).startsWith(dir)));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    resolveJsonModule: true,
    types: [],
  });
  const checker = program.getTypeChecker();

  const classes: Vec2Schema['classes'] = {};
  const operations: Record<string, OperationSchema> = {};
  const functionModules = new Map<string, string[]>();
  /** Class name → static `type` tag, filled before members are described. */
  const classSymbols = new Map<ts.Symbol, string>();

  const sourceFiles = files
    .map((file) => program.getSourceFile(file)!)
    .sort((a, b) => moduleOf(a.fileName).localeCompare(moduleOf(b.fileName)));

  for (const source of sourceFiles) {
    for (const statement of source.statements) {
      if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
        const symbol = checker.getSymbolAtLocation(statement.name)!;
        classSymbols.set(symbol, statement.name.text);
      }
    }
  }

  const describe = (type: ts.Type, seen: Set<ts.Type> = new Set()): TypeRef =>
    describeType(checker, type, classSymbols, seen);

  for (const source of sourceFiles) {
    const module = moduleOf(source.fileName);
    for (const statement of source.statements) {
      if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
        const name = statement.name.text;
        classes[name] = { module, typeTag: staticTypeTag(statement) };
        collectClass(statement, name, module);
      } else if (
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        isExported(statement) &&
        FUNCTION_FOLDERS.some((dir) => module.startsWith(dir))
      ) {
        const name = statement.name.text;
        const signature = checker.getSignatureFromDeclaration(statement)!;
        addOperation(`${module}:${name}`, 'function', null, module, signature, name);
        functionModules.set(module, [...(functionModules.get(module) ?? []), name]);
      }
    }
  }

  function collectClass(node: ts.ClassDeclaration, owner: string, module: string) {
    const classSymbol = checker.getSymbolAtLocation(node.name!)!;
    const staticType = checker.getTypeOfSymbolAtLocation(classSymbol, node);
    const instanceType = checker.getDeclaredTypeOfSymbol(classSymbol);

    const constructorDecl = node.members.find(ts.isConstructorDeclaration);
    if (!constructorDecl || isPublic(constructorDecl)) {
      const [signature] = staticType.getConstructSignatures();
      if (signature) addOperation(`${owner}.new`, 'constructor', owner, module, signature, 'new', instanceType);
    }

    for (const member of node.members) {
      if (!member.name || !isPublic(member) || ts.isConstructorDeclaration(member)) continue;
      const memberName = member.name.getText();
      if (memberName.startsWith('_') || memberName.startsWith('#')) continue;
      const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword);
      const id = `${owner}${isStatic ? '.' : '#'}${memberName}`;

      if (ts.isMethodDeclaration(member)) {
        if (member.asteriskToken) {
          addUnsupported(id, isStatic ? 'static' : 'method', owner, module, memberName, 'generator method');
          continue;
        }
        const symbol = checker.getSymbolAtLocation(member.name)!;
        const declarations = symbol.getDeclarations()?.filter(ts.isMethodDeclaration) ?? [];
        if (declarations.filter((declaration) => !declaration.body).length > 0) {
          addUnsupported(id, isStatic ? 'static' : 'method', owner, module, memberName, 'overloaded method');
          continue;
        }
        if (operations[id]) continue;
        const signature = checker.getSignatureFromDeclaration(member)!;
        addOperation(id, isStatic ? 'static' : 'method', owner, module, signature, memberName);
      } else if (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) {
        if (memberName === 'type') continue; // the type tag is metadata, not an operation
        const type = checker.getTypeAtLocation(member);
        if (type.getCallSignatures().length > 0) continue;
        addValue(id, isStatic ? 'constant' : 'field', owner, module, memberName, describe(type));
      }
    }

    // Constructor parameter properties (`constructor(public readonly from: Vec2)`) are fields too.
    for (const parameter of constructorDecl?.parameters ?? []) {
      if (!ts.isIdentifier(parameter.name) || !isPublic(parameter) || !hasAnyModifier(parameter)) continue;
      const id = `${owner}#${parameter.name.text}`;
      addValue(id, 'field', owner, module, parameter.name.text, describe(checker.getTypeAtLocation(parameter)));
    }
  }

  function addOperation(
    id: string,
    kind: OperationKind,
    owner: string | null,
    module: string,
    signature: ts.Signature,
    member: string,
    returnOverride?: ts.Type,
  ) {
    const params: ParamSchema[] = signature.getParameters().map((symbol) => {
      const declaration = symbol.valueDeclaration as ts.ParameterDeclaration;
      const rest = !!declaration.dotDotDotToken;
      let type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      if (rest && checker.isArrayType(type)) type = checker.getTypeArguments(type as ts.TypeReference)[0]!;
      const optional = !!declaration.questionToken || !!declaration.initializer;
      return {
        name: symbol.name,
        type: describe(optional ? checker.getNonNullableType(type) : type),
        ...(optional ? { optional: true } : {}),
        ...(rest ? { rest: true } : {}),
      };
    });
    const returns = describe(returnOverride ?? signature.getReturnType());
    finish({ id, kind, owner, module, member, params, returns });
  }

  function addValue(id: string, kind: OperationKind, owner: string, module: string, member: string, returns: TypeRef) {
    finish({ id, kind, owner, module, member, params: [], returns });
  }

  function addUnsupported(id: string, kind: OperationKind, owner: string, module: string, member: string, why: string) {
    operations[id] = {
      kind,
      owner,
      module,
      member,
      params: [],
      returns: { kind: 'unsupported', text: why },
      recordable: false,
      reason: why,
    };
  }

  function finish(entry: Omit<OperationSchema, 'recordable' | 'reason'> & { id: string }) {
    const { id, ...rest } = entry;
    const reason =
      policyReason(id, entry.owner) ??
      [
        ...entry.params.map((param) => [`parameter ${param.name}`, param.type] as const),
        ['return value', entry.returns] as const,
      ]
        .map(([label, type]) => unsupportedIn(type, label))
        .find((found) => found !== null) ??
      (entry.returns.kind === 'void' ? 'returns nothing' : null);
    operations[id] = { ...rest, recordable: reason === null, ...(reason ? { reason } : {}) };
  }

  const sortedOperations = Object.fromEntries(Object.entries(operations).sort(([a], [b]) => a.localeCompare(b)));
  const body = { classes: sortObject(classes), operations: sortedOperations };
  const hash = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)}`;
  const schema: Vec2Schema = { format: 'vec2-schema', version: 1, hash, ...body };

  return { schema, bindings: renderBindings(classes, functionModules), ids: renderIds(Object.keys(sortedOperations)) };
}

function policyReason(id: string, owner: string | null): string | null {
  if (owner && policy.excludeClasses[owner as keyof typeof policy.excludeClasses]) {
    return `policy: ${policy.excludeClasses[owner as keyof typeof policy.excludeClasses]}`;
  }
  const member = id.replace(/^.*[.#:]/, '');
  if (policy.excludeMembers[member as keyof typeof policy.excludeMembers]) {
    return `policy: ${policy.excludeMembers[member as keyof typeof policy.excludeMembers]}`;
  }
  const exact = (policy.excludeOperations as Record<string, string>)[id];
  return exact ? `policy: ${exact}` : null;
}

function unsupportedIn(type: TypeRef, label: string): string | null {
  switch (type.kind) {
    case 'unsupported':
      return `${label} has an unsupported type (${type.text})`;
    case 'array':
      return unsupportedIn(type.of, label);
    case 'tuple':
    case 'union':
      return (
        (type.kind === 'tuple' ? type.items : type.of).map((item) => unsupportedIn(item, label)).find((r) => r) ?? null
      );
    case 'object':
      return (
        Object.values(type.fields)
          .map((field) => unsupportedIn(field.type, label))
          .find((r) => r) ?? null
      );
    default:
      return null;
  }
}

function describeType(
  checker: ts.TypeChecker,
  type: ts.Type,
  classSymbols: ReadonlyMap<ts.Symbol, string>,
  seen: Set<ts.Type>,
): TypeRef {
  const flags = type.getFlags();
  const text = () => checker.typeToString(type).slice(0, 120);

  if (flags & ts.TypeFlags.Number) return { kind: 'number' };
  if (flags & ts.TypeFlags.String) return { kind: 'string' };
  if (flags & ts.TypeFlags.Boolean) return { kind: 'boolean' };
  if (flags & ts.TypeFlags.Null) return { kind: 'null' };
  if (flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return { kind: 'void' };
  if (type.isNumberLiteral() || type.isStringLiteral()) return { kind: 'literal', value: type.value };
  if (flags & ts.TypeFlags.BooleanLiteral) return { kind: 'literal', value: text() === 'true' };

  // `Readonly<T>` (frozen constants) describes the same data as `T`.
  if (type.aliasSymbol?.getName() === 'Readonly' && type.aliasTypeArguments?.length === 1) {
    return describeType(checker, type.aliasTypeArguments[0]!, classSymbols, seen);
  }
  // A generic parameter is described by its constraint (`T extends Polyline2 | Polygon2`).
  if (flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    if (constraint && constraint !== type && !(constraint.getFlags() & ts.TypeFlags.Unknown)) {
      return describeType(checker, constraint, classSymbols, seen);
    }
  }

  if (type.isUnion()) {
    const members = type.types.filter((member) => !(member.getFlags() & ts.TypeFlags.Undefined));
    const hasTrue = members.some(
      (m) => m.getFlags() & ts.TypeFlags.BooleanLiteral && checker.typeToString(m) === 'true',
    );
    const hasFalse = members.some(
      (m) => m.getFlags() & ts.TypeFlags.BooleanLiteral && checker.typeToString(m) === 'false',
    );
    const rest = members.filter((m) => !(hasTrue && hasFalse && m.getFlags() & ts.TypeFlags.BooleanLiteral));
    const of = [
      ...(hasTrue && hasFalse ? [{ kind: 'boolean' } as TypeRef] : []),
      ...rest.map((m) => describeType(checker, m, classSymbols, seen)),
    ];
    return of.length === 1 ? of[0]! : { kind: 'union', of };
  }

  if (checker.isTupleType(type)) {
    return {
      kind: 'tuple',
      items: checker
        .getTypeArguments(type as ts.TypeReference)
        .map((item) => describeType(checker, item, classSymbols, seen)),
    };
  }
  if (checker.isArrayType(type)) {
    return {
      kind: 'array',
      of: describeType(checker, checker.getTypeArguments(type as ts.TypeReference)[0]!, classSymbols, seen),
    };
  }

  const symbol = type.getSymbol() ?? type.aliasSymbol;
  const className = symbol && classSymbols.get(symbol);
  if (className) return { kind: 'class', type: className };

  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.TypeParameter)) {
    return { kind: 'unsupported', text: text() };
  }
  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
    return { kind: 'unsupported', text: `function ${text()}` };
  }
  if (flags & ts.TypeFlags.Object) {
    const name = symbol?.getName();
    if (name && ['Map', 'Set', 'WeakMap', 'Generator', 'Iterator', 'IterableIterator', 'Promise'].includes(name)) {
      return { kind: 'unsupported', text: text() };
    }
    if (symbol && isNonExportedClass(symbol)) return { kind: 'unsupported', text: text() };
    if (seen.has(type) || seen.size > 6) return { kind: 'unsupported', text: `recursive ${text()}` };
    const next = new Set(seen).add(type);
    const fields: Record<string, { type: TypeRef; optional?: true }> = {};
    for (const property of checker.getPropertiesOfType(type)) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (!declaration) continue;
      const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
      if (propertyType.getCallSignatures().length > 0) continue; // methods of a result object are not data
      const optional = (property.getFlags() & ts.SymbolFlags.Optional) !== 0;
      fields[property.name] = {
        type: describeType(
          checker,
          optional ? checker.getNonNullableType(propertyType) : propertyType,
          classSymbols,
          next,
        ),
        ...(optional ? { optional: true as const } : {}),
      };
    }
    return { kind: 'object', fields };
  }
  return { kind: 'unsupported', text: text() };
}

/** A class that is not a vec2 export (e.g. a private helper class) cannot be described as data. */
function isNonExportedClass(symbol: ts.Symbol): boolean {
  return (symbol.getDeclarations() ?? []).some((declaration) => ts.isClassDeclaration(declaration));
}

const isExported = (node: ts.Node) => hasModifier(node, ts.SyntaxKind.ExportKeyword);

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some((modifier) => modifier.kind === kind);
}

function hasAnyModifier(node: ts.Node): boolean {
  return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).length > 0;
}

function isPublic(node: ts.Node): boolean {
  return !hasModifier(node, ts.SyntaxKind.PrivateKeyword) && !hasModifier(node, ts.SyntaxKind.ProtectedKeyword);
}

function staticTypeTag(node: ts.ClassDeclaration): string | null {
  for (const member of node.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      hasModifier(member, ts.SyntaxKind.StaticKeyword) &&
      member.name.getText() === 'type' &&
      member.initializer
    ) {
      const initializer = ts.isAsExpression(member.initializer) ? member.initializer.expression : member.initializer;
      if (ts.isStringLiteral(initializer)) return initializer.text;
    }
  }
  return null;
}

function sortObject<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function renderBindings(classes: Vec2Schema['classes'], functionModules: ReadonlyMap<string, string[]>): string {
  const imports = new Map<string, string[]>();
  for (const [name, { module }] of Object.entries(classes)) imports.set(module, [...(imports.get(module) ?? []), name]);
  for (const [module, names] of functionModules) imports.set(module, [...(imports.get(module) ?? []), ...names]);
  const sortedModules = [...imports.keys()].sort();

  const lines = [
    '// Generated by scripts/vec2-schema.ts; do not edit. Regenerate with `bun run schema`.',
    ...sortedModules.map(
      (module) => `import { ${[...new Set(imports.get(module))].sort().join(', ')} } from '../src/${module}';`,
    ),
    '',
    '/** Exported vec2 classes by name. */',
    'export const classes = {',
    ...Object.keys(classes).map((name) => `  ${name},`),
    '} as const;',
    '',
    '/** Operation functions by `<module>:<name>`. */',
    'export const functions = {',
    ...[...functionModules]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([module, names]) => [...names].sort().map((name) => `  '${module}:${name}': ${name},`)),
    '} as const;',
    '',
  ];
  return lines.join('\n');
}

function renderIds(ids: readonly string[]): string {
  return [
    '// Generated by scripts/vec2-schema.ts; do not edit. Regenerate with `bun run schema`.',
    '/** Every operation id in vec2.schema.json. */',
    'export type OperationId =',
    ...ids.map((id, index) => `  | '${id}'${index === ids.length - 1 ? ';' : ''}`),
    '',
  ].join('\n');
}

export const schemaFiles = {
  schema: path.join(schemaDir, 'vec2.schema.json'),
  bindings: path.join(schemaDir, 'bindings.ts'),
  ids: path.join(schemaDir, 'ids.ts'),
};

/** The generated files, formatted like the rest of `packages/` so `format:check` accepts them. */
export async function renderSchemaFiles(): Promise<Record<keyof typeof schemaFiles, string>> {
  const { schema, bindings, ids } = generateSchema();
  const config = (await prettier.resolveConfig(schemaFiles.bindings)) ?? {};
  const format = (text: string, filepath: string) => prettier.format(text, { ...config, filepath });
  return {
    schema: await format(JSON.stringify(schema), schemaFiles.schema),
    bindings: await format(bindings, schemaFiles.bindings),
    ids: await format(ids, schemaFiles.ids),
  };
}

if (import.meta.main) {
  const rendered = await renderSchemaFiles();
  const check = process.argv.includes('--check');
  const stale = (Object.keys(schemaFiles) as (keyof typeof schemaFiles)[]).filter((key) => {
    let current = '';
    try {
      current = readFileSync(schemaFiles[key], 'utf8');
    } catch {}
    return current !== rendered[key];
  });
  if (check) {
    if (stale.length > 0) {
      console.error(
        `Stale schema files: ${stale.map((key) => path.relative(repoRoot, schemaFiles[key])).join(', ')}. Run \`bun run schema\`.`,
      );
      process.exit(1);
    }
    console.log('vec2 schema is up to date.');
  } else {
    for (const key of stale) writeFileSync(schemaFiles[key], rendered[key]);
    const parsed = JSON.parse(rendered.schema) as Vec2Schema;
    const all = Object.values(parsed.operations);
    console.log(
      `vec2 schema: ${all.length} operations, ${all.filter((op) => op.recordable).length} recordable (${parsed.hash}).`,
    );
  }
}
