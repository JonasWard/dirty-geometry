#!/usr/bin/env bun
/**
 * Generates the vec2 type schema from the TypeScript source, with the compiler API (TypeScript keeps no
 * types at runtime). Recording and replay do not need it; dense packing and the playground do.
 *
 * - packages/vec2/schema/vec2.schema.json: the `src` folder tree. Each file lists its classes (`json` shape,
 *   `new` parameters, `members`) and, under `operations/**\/helpers/`, its helper functions. Numbers are typed
 *   by role (coordinate, angle, parameter, integer, epsilon); shared shapes are named once under `types`.
 * - packages/vec2/schema/bindings.ts: the class and helper tables the recorder and replay call.
 *
 *   bun run schema          # regenerate
 *   bun run schema:check    # fail when the committed files are stale
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import ts from 'typescript';
import { SKIP_CLASSES, SKIP_MEMBERS } from '../packages/vec2/schema/policy';

const repoRoot = path.resolve(import.meta.dir, '..');
const srcRoot = path.join(repoRoot, 'packages/vec2/src');
const schemaDir = path.join(repoRoot, 'packages/vec2/schema');

/** Number roles by parameter or field name; any other number is a coordinate. */
const ROLES: Record<string, string> = {
  ...Object.fromEntries(['theta', 'radians', 'angle'].map((name) => [name, 'angle'])),
  t: 'parameter',
  ...Object.fromEntries(
    ['i', 'j', 'index', 'count', 'hash', 'edge', 'a', 'b', 'constraints', 'triangles', 'direction'].map((name) => [
      name,
      'integer',
    ]),
  ),
};
/** Exceptions by `Class.member` (its parameters) or by class (its json fields). */
const ROLE_EXCEPTIONS: Record<string, Record<string, string>> = {
  'Epsilon.areEqual': { a: 'coordinate', b: 'coordinate' },
  'Epsilon.custom': { input: 'epsilon' },
  'Angle.new': { value: 'angle' },
  Angle: { value: 'angle' },
  Epsilon: { value: 'epsilon' },
};
/** Roles of the numbers inside named types. */
const TYPE_ROLES: Record<string, string> = { ConstraintEdgeInput: 'integer' };
const roleOf = (name: string, scope: string) => ROLE_EXCEPTIONS[scope]?.[name] ?? ROLES[name] ?? 'coordinate';

type Type =
  | string
  | Type[]
  | { enum: (string | number | boolean | null)[] }
  | { or: Type[] }
  | { tuple: Type[] }
  | { object: Record<string, Slot> }
  | { record: Type };
type Slot = Type | { type: Type; optional?: true; rest?: true };
type Entry = { static?: true | Entry; params?: Record<string, Slot>; returns?: Type; value?: Type } | null;

class Unsupported extends Error {}

const listSources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listSources(full) : name.endsWith('.ts') ? [full] : [];
  });
const moduleOf = (file: string) => path.relative(srcRoot, file).replace(/\\/g, '/').replace(/\.ts$/, '');
const modifiers = (node: ts.Node) => (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []);
const has = (node: ts.Node, kind: ts.SyntaxKind) => modifiers(node).some((modifier) => modifier.kind === kind);
const isPublic = (node: ts.Node) =>
  !has(node, ts.SyntaxKind.PrivateKeyword) && !has(node, ts.SyntaxKind.ProtectedKeyword);
const slot = (type: Type, optional?: boolean, rest?: boolean): Slot =>
  optional || rest ? { type, ...(optional ? { optional: true as const } : {}), ...(rest ? { rest: true as const } : {}) } : type;
const sorted = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

export function generateSchema() {
  const files = listSources(srcRoot).filter((file) => !moduleOf(file).startsWith('recording/'));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const sources = files.map((file) => ({ source: program.getSourceFile(file)!, module: moduleOf(file) }));
  const exported = (node: ts.Node) => has(node, ts.SyntaxKind.ExportKeyword);

  const classes = new Map<ts.Symbol, string>();
  const aliases = new Map<ts.Symbol, ts.TypeAliasDeclaration>();
  for (const { source } of sources) {
    for (const st of source.statements) {
      if (!exported(st)) continue;
      if (ts.isClassDeclaration(st) && st.name) classes.set(checker.getSymbolAtLocation(st.name)!, st.name.text);
      if (ts.isTypeAliasDeclaration(st) && !st.typeParameters) aliases.set(checker.getSymbolAtLocation(st.name)!, st);
    }
  }
  /** `Vec2Json` → `Vec2`: a class's json type is written as the class name. */
  const jsonOf = new Map<ts.TypeAliasDeclaration, string>();
  for (const [symbol, name] of classes) {
    const toJson = (symbol.valueDeclaration as ts.ClassDeclaration).members.find(
      (m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && m.name.getText() === 'toJson',
    );
    const decl = toJson?.type && ts.isTypeReferenceNode(toJson.type) ? aliasDecl(toJson.type.typeName) : undefined;
    if (decl) jsonOf.set(decl, name);
  }

  function aliasDecl(name: ts.EntityName) {
    let symbol = checker.getSymbolAtLocation(name);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol && aliases.get(symbol);
  }

  const types: Record<string, Type | null | false> = {};
  let jsonMode = false;
  /** A named type, or `undefined` when its body is better written in place (a primitive, a class). */
  function named(decl: ts.TypeAliasDeclaration): string | undefined {
    if (jsonOf.has(decl)) return jsonOf.get(decl);
    const name = decl.name.text;
    if (name.endsWith('Json')) return undefined;
    if (name in types) return types[name] ? name : undefined; // `null` while in progress: expand the body
    types[name] = null;
    try {
      const body = fromNode(decl.type, TYPE_ROLES[name] ?? 'coordinate');
      types[name] = typeof body === 'string' && !(body in types) ? false : body;
    } catch (error) {
      types[name] = false;
      throw error;
    }
    return types[name] === false ? undefined : name;
  }

  const union = (items: Type[]): Type => {
    const flat = items.flatMap((item) => (typeof item === 'object' && 'or' in item ? item.or : [item]));
    const literals = flat.every((item) => item === 'null' || (typeof item === 'object' && 'enum' in item));
    if (literals) return { enum: flat.flatMap((item) => (item === 'null' ? [null] : (item as { enum: [] }).enum)) };
    return flat.length === 1 ? flat[0]! : { or: flat };
  };
  const field = (name: string, type: Type, optional: boolean) => {
    if (jsonMode && typeof type === 'object' && 'or' in type && type.or.includes('null')) {
      return [name, slot(union(type.or.filter((item) => item !== 'null')), true)] as const;
    }
    if (jsonMode && typeof type === 'object' && 'enum' in type && type.enum.includes(null) && type.enum.length > 1) {
      return [name, slot({ enum: type.enum.filter((item) => item !== null) }, true)] as const;
    }
    return [name, slot(type, optional)] as const;
  };

  /** From the declared type node where there is one, so source alias names survive. */
  function fromNode(node: ts.TypeNode | undefined, role?: string, scope = ''): Type {
    if (!node) throw new Unsupported('no type');
    const typeOf = (n: ts.TypeNode) => checker.getTypeFromTypeNode(n);
    if (ts.isParenthesizedTypeNode(node)) return fromNode(node.type, role, scope);
    if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) {
      return fromNode(node.type, role, scope);
    }
    if (ts.isTypeReferenceNode(node)) {
      const decl = node.typeArguments ? undefined : aliasDecl(node.typeName);
      const name = decl && named(decl);
      if (name) return name;
      if (node.typeName.getText() === 'Readonly' && node.typeArguments?.length === 1) {
        return fromNode(node.typeArguments[0], role, scope);
      }
    }
    if (ts.isArrayTypeNode(node)) return [fromNode(node.elementType, role, scope)];
    if (ts.isTupleTypeNode(node)) return { tuple: node.elements.map((element) => fromNode(element, role, scope)) };
    if (ts.isUnionTypeNode(node)) {
      return union(
        node.types.filter((t) => t.kind !== ts.SyntaxKind.UndefinedKeyword).map((t) => fromNode(t, role, scope)),
      );
    }
    if (ts.isTypeLiteralNode(node)) {
      const fields = node.members.filter(ts.isPropertySignature).map((member) => {
        const name = member.name.getText();
        const fieldRole = role === undefined ? undefined : roleOf(name, scope);
        return field(name, fromNode(member.type, fieldRole, scope), !!member.questionToken);
      });
      return { object: Object.fromEntries(fields) };
    }
    if (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword) return 'null';
    if (ts.isFunctionTypeNode(node)) throw new Unsupported(`callback ${node.getText()}`);
    return fromType(typeOf(node), role, scope);
  }

  /** From the checker's type, when no usable type node exists. */
  function fromType(type: ts.Type, role?: string, scope = '', seen = new Set<ts.Type>()): Type {
    const flags = type.getFlags();
    const text = () => checker.typeToString(type);
    const isBool = (t: ts.Type) => (t.getFlags() & ts.TypeFlags.BooleanLiteral) !== 0;
    const alias = type.aliasSymbol && aliases.get(type.aliasSymbol);
    const name = alias && named(alias);
    if (name) return name;
    if (flags & ts.TypeFlags.Number) return role ?? 'number';
    if (flags & ts.TypeFlags.String) return 'string';
    if (flags & ts.TypeFlags.Boolean) return 'boolean';
    if (flags & ts.TypeFlags.Null) return 'null';
    if (flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return 'void';
    if (type.isNumberLiteral() || type.isStringLiteral()) return { enum: [type.value] };
    if (isBool(type)) return { enum: [text() === 'true'] };
    if (type.aliasSymbol?.getName() === 'Readonly' && type.aliasTypeArguments?.length === 1) {
      return fromType(type.aliasTypeArguments[0]!, role, scope, seen);
    }
    if (type.aliasSymbol?.getName() === 'Record' && type.aliasTypeArguments?.length === 2) {
      return { record: fromType(type.aliasTypeArguments[1]!, role, scope, seen) };
    }
    if (flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint && constraint !== type && !(constraint.getFlags() & ts.TypeFlags.Unknown)) {
        return fromType(constraint, role, scope, seen);
      }
    }
    if (type.isUnion()) {
      const members = type.types.filter((t) => !(t.getFlags() & ts.TypeFlags.Undefined));
      const fold = members.filter(isBool).length === 2; // `boolean` is stored as `true | false`
      const rest = members.filter((t) => !(fold && isBool(t))).map((t) => fromType(t, role, scope, seen));
      return union([...(fold ? ['boolean'] : []), ...rest]);
    }
    if (checker.isTupleType(type)) {
      return { tuple: checker.getTypeArguments(type as ts.TypeReference).map((t) => fromType(t, role, scope, seen)) };
    }
    if (checker.isArrayType(type)) return [fromType(checker.getTypeArguments(type as ts.TypeReference)[0]!, role, scope, seen)];
    const symbol = type.getSymbol() ?? type.aliasSymbol;
    if (symbol && classes.has(symbol)) return classes.get(symbol)!;
    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.TypeParameter)) {
      throw new Unsupported(text());
    }
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      throw new Unsupported(`callback ${text()}`);
    }
    if (!(flags & ts.TypeFlags.Object) && !type.isIntersection()) throw new Unsupported(text());
    if (symbol?.getName() === 'Iterable') return [fromType(checker.getTypeArguments(type as ts.TypeReference)[0]!, role, scope, seen)];
    const builtIn = ['Map', 'Set', 'WeakMap', 'Generator', 'Iterator', 'IterableIterator', 'Promise'];
    if (symbol && (builtIn.includes(symbol.getName()) || symbol.getDeclarations()?.some(ts.isClassDeclaration))) {
      throw new Unsupported(text());
    }
    if (seen.has(type) || seen.size > 6) throw new Unsupported(`recursive ${text()}`);
    const fields = checker.getPropertiesOfType(type).flatMap((property) => {
      const decl = property.valueDeclaration ?? property.declarations?.[0];
      if (!decl) return [];
      const optional = (property.getFlags() & ts.SymbolFlags.Optional) !== 0;
      let propertyType = checker.getTypeOfSymbolAtLocation(property, decl);
      if (propertyType.getCallSignatures().length > 0) return []; // methods of a result object are not data
      if (optional) propertyType = checker.getNonNullableType(propertyType);
      const fieldRole = role === undefined ? undefined : roleOf(property.name, scope);
      const declared = (decl as ts.PropertySignature).type;
      const described = declared
        ? fromNode(declared, fieldRole, scope)
        : fromType(propertyType, fieldRole, scope, new Set(seen).add(type));
      return [field(property.name, described, optional)];
    });
    return { object: Object.fromEntries(fields) };
  }

  const skipped: string[] = [];
  /** Parameters and result of a signature; `null` when it cannot be recorded. */
  function call(id: string, decl: ts.SignatureDeclaration, isStatic: boolean): Entry {
    try {
      const params = Object.fromEntries(
        decl.parameters.map((p) => {
          const rest = !!p.dotDotDotToken;
          const role = roleOf(p.name.getText(), id);
          let type = p.type ? fromNode(p.type, role, '') : fromType(checker.getTypeAtLocation(p), role);
          if (rest && Array.isArray(type)) type = type[0]!;
          return [p.name.getText(), slot(type, !!p.questionToken || !!p.initializer, rest)];
        }),
      );
      const signature = checker.getSignatureFromDeclaration(decl)!;
      const returns = decl.type ? fromNode(decl.type) : fromType(signature.getReturnType());
      if (returns === 'void') throw new Unsupported('returns nothing');
      return { ...(isStatic ? { static: true as const } : {}), ...(decl.parameters.length ? { params } : {}), returns };
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      skipped.push(`${id}: ${error.message}`);
      return null;
    }
  }
  function read(id: string, node: ts.Node, typeNode: ts.TypeNode | undefined, isStatic: boolean): Entry {
    try {
      const value = typeNode ? fromNode(typeNode) : fromType(checker.getTypeAtLocation(node));
      return { ...(isStatic ? { static: true as const } : {}), value };
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      skipped.push(`${id}: ${error.message}`);
      return null;
    }
  }

  function describeClass(decl: ts.ClassDeclaration, name: string) {
    const ctor = decl.members.find(ts.isConstructorDeclaration);
    const instance: Record<string, Entry> = {};
    const statics: Record<string, Entry> = {};
    for (const member of decl.members) {
      if (!member.name || !ts.isIdentifier(member.name) || !isPublic(member) || ts.isSetAccessor(member)) continue;
      const key = member.name.text;
      if (key.startsWith('_') || key === 'type') continue;
      const isStatic = has(member, ts.SyntaxKind.StaticKeyword);
      const target = isStatic ? statics : instance;
      const id = `${name}.${key}`;
      if (key in target) continue;
      if (ts.isMethodDeclaration(member)) {
        const overloaded = (checker.getSymbolAtLocation(member.name)?.getDeclarations() ?? []).some(
          (d) => ts.isMethodDeclaration(d) && !d.body,
        );
        const reason = SKIP_MEMBERS.has(key) ? 'policy' : member.asteriskToken ? 'generator' : overloaded ? 'overloaded' : null;
        if (reason) skipped.push(`${id}: ${reason}`);
        target[key] = reason ? null : call(id, member, isStatic);
      } else if (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) {
        if (checker.getTypeAtLocation(member).getCallSignatures().length > 0) continue;
        target[key] = read(id, member, member.type, isStatic);
      }
    }
    for (const p of ctor?.parameters ?? []) {
      if (ts.isIdentifier(p.name) && isPublic(p) && modifiers(p).length > 0) {
        instance[p.name.text] = read(`${name}.${p.name.text}`, p, p.type, false);
      }
    }
    // A static and an instance member may share a name: the static one nests under `static`.
    const members: Record<string, Entry> = { ...statics, ...instance };
    for (const key of Object.keys(statics)) {
      if (key in instance && instance[key] && statics[key]) {
        const { static: _, ...staticEntry } = statics[key]!;
        members[key] = { ...instance[key], static: staticEntry };
      } else if (key in instance && !instance[key]) members[key] = statics[key]!;
    }

    const toJson = decl.members.find((m) => ts.isMethodDeclaration(m) && m.name.getText() === 'toJson') as
      | ts.MethodDeclaration
      | undefined;
    const jsonDecl = toJson?.type && ts.isTypeReferenceNode(toJson.type) ? aliasDecl(toJson.type.typeName) : undefined;
    jsonMode = true;
    const json = jsonDecl ? fromNode(jsonDecl.type, 'coordinate', name) : undefined;
    jsonMode = false;
    const constructible = !ctor || isPublic(ctor);
    return {
      ...(json ? { json } : {}),
      ...(constructible ? { new: ctor ? (call(`${name}.new`, ctor, false)?.params ?? {}) : {} } : {}),
      members: sorted(members),
    };
  }

  const modules: Record<string, any> = {};
  const at = (module: string) => module.split('/').reduce((node, part) => (node[part] ??= {}), modules);
  const tables = { classes: [] as [string, string][], helpers: [] as [string, string][] };
  const misplaced: string[] = [];
  const helperNames = new Set<string>();
  for (const { source, module } of sources) {
    for (const st of source.statements) {
      const named = st as ts.Statement & { name?: ts.Node };
      if (!exported(st) || !named.name || !ts.isIdentifier(named.name)) continue;
      const name = named.name.text;
      if (ts.isClassDeclaration(st) && !SKIP_CLASSES.has(name)) {
        at(module)[name] = describeClass(st, name);
        tables.classes.push([module, name]);
      } else if (ts.isFunctionDeclaration(st) && module.startsWith('operations/')) {
        if (!module.split('/').includes('helpers')) misplaced.push(`${module}:${name}`);
        else if (helperNames.has(name)) throw new Error(`Helper ${name} is exported twice`);
        else {
          helperNames.add(name);
          at(module)[name] = call(name, st, false);
          tables.helpers.push([module, name]);
        }
      }
    }
  }
  if (misplaced.length > 0) {
    throw new Error(`Operations must be class members or live in a helpers/ folder: ${misplaced.join(', ')}`);
  }
  const sortTree = (node: any): any =>
    node === null || 'members' in node || 'returns' in node
      ? node
      : Object.fromEntries(Object.entries(sorted(node)).map(([key, child]) => [key, sortTree(child)]));
  const namedTypes = sorted(Object.fromEntries(Object.entries(types).filter(([, body]) => body)) as Record<string, Type>);
  return { types: namedTypes, modules: sortTree(modules), tables, skipped };
}

// ---- writing: folders, files, classes and `members` expanded; every entry on one line ----
const one = (value: unknown): string =>
  value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(one).join(', ')}]`
      : Object.keys(value).length === 0
        ? '{}'
        : `{ ${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${one(item)}`).join(', ')} }`;
const block = (entries: [string, string][], indent: number) =>
  `{\n${entries.map(([key, text]) => `${'  '.repeat(indent + 1)}${JSON.stringify(key)}: ${text}`).join(',\n')}\n${'  '.repeat(indent)}}`;
const writeNode = (node: any, indent: number): string => {
  if (node === null || 'returns' in node) return one(node);
  if (!('members' in node)) return block(Object.entries(node).map(([key, child]) => [key, writeNode(child, indent + 1)]), indent);
  const head = Object.entries(node).filter(([key]) => key !== 'members').map(([key, v]) => [key, one(v)] as [string, string]);
  const members = Object.entries(node.members).map(([key, entry]) => [key, one(entry)] as [string, string]);
  return block([...head, ['members', block(members, indent + 1)]], indent);
};

export const schemaFiles = {
  schema: path.join(schemaDir, 'vec2.schema.json'),
  bindings: path.join(schemaDir, 'bindings.ts'),
};

export async function renderSchemaFiles(): Promise<Record<keyof typeof schemaFiles, string> & { skipped: string[] }> {
  const { types, modules, tables, skipped } = generateSchema();
  const schema = [
    '{',
    '  "format": "vec2-schema",',
    '  "version": 2,',
    `  "types": ${block(Object.entries(types).map(([key, body]) => [key, one(body)]), 1)},`,
    `  "modules": ${writeNode(modules, 1)}`,
    '}',
    '',
  ].join('\n');
  const imports = new Map<string, string[]>();
  for (const [module, name] of [...tables.classes, ...tables.helpers]) imports.set(module, [...(imports.get(module) ?? []), name]);
  const names = (list: [string, string][]) => list.map(([, name]) => name).sort();
  const bindings = [
    '// Generated by scripts/vec2-schema.ts; do not edit. Regenerate with `bun run schema`.',
    ...[...imports].sort(([a], [b]) => a.localeCompare(b)).map(([module, list]) => `import { ${list.sort().join(', ')} } from '../src/${module}';`),
    '',
    '/** The recordable vec2 classes by name. */',
    `export const classes = { ${names(tables.classes).join(', ')} } as const;`,
    '',
    '/** Helper functions by name. */',
    `export const helpers = { ${names(tables.helpers).join(', ')} } as const;`,
    '',
  ].join('\n');
  const config = (await prettier.resolveConfig(schemaFiles.bindings)) ?? {};
  return { schema, bindings: await prettier.format(bindings, { ...config, filepath: schemaFiles.bindings }), skipped };
}

if (import.meta.main) {
  const { skipped, ...rendered } = await renderSchemaFiles();
  const keys = Object.keys(schemaFiles) as (keyof typeof schemaFiles)[];
  const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
  const stale = keys.filter((key) => read(schemaFiles[key]) !== rendered[key]);
  if (process.argv.includes('--check')) {
    if (stale.length > 0) {
      console.error(`Stale: ${stale.map((key) => path.relative(repoRoot, schemaFiles[key])).join(', ')}. Run \`bun run schema\`.`);
      process.exit(1);
    }
    console.log('vec2 schema is up to date.');
  } else {
    for (const key of stale) writeFileSync(schemaFiles[key], rendered[key]);
    console.log(`vec2 schema written (${rendered.schema.split('\n').length} lines). Not recordable:\n  ${skipped.join('\n  ')}`);
  }
}
