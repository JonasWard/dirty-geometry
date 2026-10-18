#!/usr/bin/env bun
/**
 * Generates the vec2 type schema from the TypeScript source, with the compiler API (TypeScript keeps no
 * types at runtime). Recording and replay do not need it; dense packing and the playground do.
 *
 * - packages/vec2/schema/vec2.schema.json: `numbers` (the semantic number types of `core/numbers.ts` and their
 *   ranges), `types` (named shapes, including every class's `<Tag>Json` and their union `MathJson`) and `modules`,
 *   the `src` folder tree: each file lists its classes (`new` parameters, `members`) and, under
 *   `operations/**\/helpers/`, its helper functions.
 * - packages/vec2/schema/vec2.dense.json: the same types as a densing schema (scripts/vec2-dense-schema.ts).
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
import { NUMBERS } from '../packages/vec2/src/core/numbers';
import { renderDenseSchema } from './vec2-dense-schema';

const repoRoot = path.resolve(import.meta.dir, '..');
const srcRoot = path.join(repoRoot, 'packages/vec2/src');
const schemaDir = path.join(repoRoot, 'packages/vec2/schema');

/** A name, `[T]`, `{ enum }`, `{ or }`, `{ tuple }`, `{ record }`, or an object written as its fields. */
type Type = string | Record<string, any>;
type Slot = Type | { type: Type; optional?: true; rest?: true };
type Entry = { static?: true; params?: Record<string, Slot>; returns?: Type; value?: Type } | null;

class Unsupported extends Error {}

const listSources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listSources(full) : name.endsWith('.ts') ? [full] : [];
  });
const modifiers = (node: ts.Node) => (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []);
const has = (node: ts.Node, kind: ts.SyntaxKind) => modifiers(node).some((modifier) => modifier.kind === kind);
const isPublic = (node: ts.Node) =>
  !has(node, ts.SyntaxKind.PrivateKeyword) && !has(node, ts.SyntaxKind.ProtectedKeyword);
const slot = (type: Type, optional?: boolean, rest?: boolean): Slot =>
  optional || rest
    ? { type, ...(optional ? { optional: true as const } : {}), ...(rest ? { rest: true as const } : {}) }
    : type;
const RESERVED = ['enum', 'or', 'tuple', 'record'];
/** `{ or: [...] }` and the like: exactly one reserved key (an object type is written as its fields). */
const isKind = (type: unknown, kind: string): type is Record<string, any> =>
  !!type && typeof type === 'object' && !Array.isArray(type) && Object.keys(type).length === 1 && kind in type;
const sorted = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

/** `root`: the vec2 `src` folder (tests point it at a modified copy). */
export function generateSchema(root = srcRoot) {
  const moduleOf = (file: string) => path.relative(root, file).replace(/\\/g, '/').replace(/\.ts$/, '');
  const files = listSources(root).filter((file) => !moduleOf(file).startsWith('recording/'));
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
  function aliasDecl(name: ts.EntityName) {
    let symbol = checker.getSymbolAtLocation(name);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol && aliases.get(symbol);
  }

  const types: Record<string, Type | null | false> = {};
  /** Inside a `*Json` type: `| null` fields are optional and the `type` tag is left out (the name implies it). */
  let jsonMode = false;
  /** A named type (a number type, a shape), or `undefined` when its body is better written in place. */
  function named(decl: ts.TypeAliasDeclaration): string | undefined {
    const name = decl.name.text;
    if (name in NUMBERS) return name;
    if (name in types) return types[name] ? name : undefined; // `null` while in progress: expand the body
    types[name] = null;
    const outer = jsonMode;
    jsonMode = name.endsWith('Json');
    try {
      const body = fromNode(decl.type);
      types[name] = typeof body === 'string' && !(body in types) && !name.endsWith('Json') ? false : body;
    } catch (error) {
      types[name] = false;
      throw error;
    } finally {
      jsonMode = outer;
    }
    return types[name] === false ? undefined : name;
  }

  const union = (items: Type[]): Type => {
    const flat = items.flatMap((item) => (isKind(item, 'or') ? item.or : [item]));
    const literals = flat.every((item) => item === 'null' || isKind(item, 'enum'));
    if (literals) return { enum: flat.flatMap((item) => (item === 'null' ? [null] : (item as { enum: [] }).enum)) };
    return flat.length === 1 ? flat[0]! : { or: flat };
  };
  const field = (name: string, type: Type, optional: boolean) => {
    if (jsonMode && isKind(type, 'or') && type.or.includes('null')) {
      return [name, slot(union(type.or.filter((item: Type) => item !== 'null')), true)] as const;
    }
    if (jsonMode && isKind(type, 'enum') && type.enum.includes(null) && type.enum.length > 1) {
      return [name, slot({ enum: type.enum.filter((item: unknown) => item !== null) }, true)] as const;
    }
    return [name, slot(type, optional)] as const;
  };

  /** An object type, written as its fields; the `type` tag of a JSON type is left out. */
  const fieldsOf = (fields: (readonly [string, Slot])[]) => {
    const entries = fields.filter(([name]) => !(jsonMode && name === 'type'));
    const clash = entries.length === 1 && RESERVED.includes(entries[0]![0]);
    if (clash || entries.some(([name]) => name === 'optional' || name === 'rest')) {
      throw new Error(`A field named ${entries.map(([n]) => n).join(', ')} would be read as a schema keyword`);
    }
    return Object.fromEntries(entries);
  };

  /** From the declared type node where there is one, so source alias names survive. */
  function fromNode(node: ts.TypeNode | undefined): Type {
    if (!node) throw new Unsupported('no type');
    const typeOf = (n: ts.TypeNode) => checker.getTypeFromTypeNode(n);
    if (ts.isParenthesizedTypeNode(node)) return fromNode(node.type);
    if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) {
      return fromNode(node.type);
    }
    if (ts.isTypeReferenceNode(node)) {
      const decl = node.typeArguments ? undefined : aliasDecl(node.typeName);
      const name = decl && named(decl);
      if (name) return name;
      if (decl && types[decl.name.text] === false) return fromNode(decl.type); // an alias of a plain name
      const [first, second] = node.typeArguments ?? [];
      if (node.typeName.getText() === 'Readonly' && first && !second) return fromNode(first);
      if (node.typeName.getText() === 'Record' && second) return { record: fromNode(second) };
    }
    if (ts.isArrayTypeNode(node)) return [fromNode(node.elementType)];
    if (ts.isTupleTypeNode(node)) return { tuple: node.elements.map((element) => fromNode(element)) };
    if (ts.isUnionTypeNode(node)) {
      return union(node.types.filter((t) => t.kind !== ts.SyntaxKind.UndefinedKeyword).map((t) => fromNode(t)));
    }
    if (ts.isTypeLiteralNode(node)) {
      const fields = node.members.filter(ts.isPropertySignature).map((member) => {
        const name = member.name.getText();
        return field(name, fromNode(member.type), !!member.questionToken);
      });
      return fieldsOf(fields);
    }
    if (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword) return 'null';
    if (ts.isFunctionTypeNode(node)) throw new Unsupported(`callback ${node.getText()}`);
    return fromType(typeOf(node));
  }

  /** From the checker's type, when no usable type node exists. */
  function fromType(type: ts.Type, seen = new Set<ts.Type>()): Type {
    const flags = type.getFlags();
    const text = () => checker.typeToString(type);
    const isBool = (t: ts.Type) => (t.getFlags() & ts.TypeFlags.BooleanLiteral) !== 0;
    const alias = type.aliasSymbol && aliases.get(type.aliasSymbol);
    const name = alias && named(alias);
    if (name) return name;
    if (flags & ts.TypeFlags.Number) return 'number';
    if (flags & ts.TypeFlags.String) return 'string';
    if (flags & ts.TypeFlags.Boolean) return 'boolean';
    if (flags & ts.TypeFlags.Null) return 'null';
    if (flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return 'void';
    if (type.isNumberLiteral() || type.isStringLiteral()) return { enum: [type.value] };
    if (isBool(type)) return { enum: [text() === 'true'] };
    if (type.aliasSymbol?.getName() === 'Readonly' && type.aliasTypeArguments?.length === 1) {
      return fromType(type.aliasTypeArguments[0]!, seen);
    }
    if (type.aliasSymbol?.getName() === 'Record' && type.aliasTypeArguments?.length === 2) {
      return { record: fromType(type.aliasTypeArguments[1]!, seen) };
    }
    if (flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (constraint && constraint !== type && !(constraint.getFlags() & ts.TypeFlags.Unknown)) {
        return fromType(constraint, seen);
      }
    }
    if (type.isUnion()) {
      const members = type.types.filter((t) => !(t.getFlags() & ts.TypeFlags.Undefined));
      const fold = members.filter(isBool).length === 2; // `boolean` is stored as `true | false`
      const rest = members.filter((t) => !(fold && isBool(t))).map((t) => fromType(t, seen));
      return union([...(fold ? ['boolean'] : []), ...rest]);
    }
    if (checker.isTupleType(type)) {
      return { tuple: checker.getTypeArguments(type as ts.TypeReference).map((t) => fromType(t, seen)) };
    }
    if (checker.isArrayType(type)) return [fromType(checker.getTypeArguments(type as ts.TypeReference)[0]!, seen)];
    const symbol = type.getSymbol() ?? type.aliasSymbol;
    if (symbol && classes.has(symbol)) return classes.get(symbol)!;
    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never | ts.TypeFlags.TypeParameter)) {
      throw new Unsupported(text());
    }
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
      throw new Unsupported(`callback ${text()}`);
    }
    if (!(flags & ts.TypeFlags.Object) && !type.isIntersection()) throw new Unsupported(text());
    if (symbol?.getName() === 'Iterable')
      return [fromType(checker.getTypeArguments(type as ts.TypeReference)[0]!, seen)];
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
      const declared = (decl as ts.PropertySignature).type;
      const described = declared ? fromNode(declared) : fromType(propertyType, new Set(seen).add(type));
      return [field(property.name, described, optional)];
    });
    return fieldsOf(fields);
  }

  const skipped: string[] = [];
  /** Parameters and result of a signature; `null` when it cannot be recorded. */
  function call(id: string, decl: ts.SignatureDeclaration, isStatic: boolean): Entry {
    try {
      const params = Object.fromEntries(
        decl.parameters.map((p) => {
          const rest = !!p.dotDotDotToken;
          let type = p.type ? fromNode(p.type) : fromType(checker.getTypeAtLocation(p));
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
    const members: Record<string, Entry> = {};
    const statics = new Map<string, boolean>(); // name → static
    const claim = (key: string, isStatic: boolean) => {
      if (statics.has(key) && statics.get(key) !== isStatic) {
        throw new Error(`${name}.${key} is both a static and an instance member; rename one`);
      }
      return !statics.has(key) && !!statics.set(key, isStatic);
    };
    for (const member of decl.members) {
      // Private (`private`, `protected`, `#x`, `_x`) members are never listed; nor are static values (constants).
      if (!member.name || !ts.isIdentifier(member.name) || !isPublic(member) || ts.isSetAccessor(member)) continue;
      const key = member.name.text;
      const isStatic = has(member, ts.SyntaxKind.StaticKeyword);
      if (key.startsWith('_') || key === 'type' || (isStatic && !ts.isMethodDeclaration(member))) continue;
      const id = `${name}.${key}`;
      if (!claim(key, isStatic)) continue;
      const target = members;
      if (ts.isMethodDeclaration(member)) {
        const overloaded = (checker.getSymbolAtLocation(member.name)?.getDeclarations() ?? []).some(
          (d) => ts.isMethodDeclaration(d) && !d.body,
        );
        // `toJson` is listed with its JSON type, though the recorder never records it.
        const reason =
          SKIP_MEMBERS.has(key) && key !== 'toJson'
            ? 'policy'
            : member.asteriskToken
              ? 'generator'
              : overloaded
                ? 'overloaded'
                : null;
        if (reason) skipped.push(`${id}: ${reason}`);
        target[key] = reason ? null : call(id, member, isStatic);
      } else if (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) {
        if (checker.getTypeAtLocation(member).getCallSignatures().length > 0) continue;
        target[key] = read(id, member, member.type, isStatic);
      }
    }
    for (const p of ctor?.parameters ?? []) {
      if (ts.isIdentifier(p.name) && isPublic(p) && modifiers(p).length > 0 && claim(p.name.text, false)) {
        members[p.name.text] = read(`${name}.${p.name.text}`, p, p.type, false);
      }
    }
    const constructible = !ctor || isPublic(ctor);
    return {
      ...(constructible ? { new: ctor ? (call(`${name}.new`, ctor, false)?.params ?? {}) : {} } : {}),
      members: sorted(members),
    };
  }

  const modules: Record<string, any> = {};
  /** The folder a module's classes and helpers go in (files are not a level); names must be unique there. */
  const put = (module: string, name: string, entry: unknown) => {
    const folder = module
      .split('/')
      .slice(0, -1)
      .reduce((node, part) => (node[part] ??= {}), modules);
    if (name in folder) throw new Error(`${name} appears twice in ${module.split('/').slice(0, -1).join('/')}/`);
    folder[name] = entry;
  };
  const tables = { classes: [] as [string, string][], helpers: [] as [string, string][] };
  const misplaced: string[] = [];
  const helperNames = new Set<string>();
  const toJsonTypes: string[] = [];
  for (const { source, module } of sources) {
    for (const st of source.statements) {
      const named = st as ts.Statement & { name?: ts.Node };
      if (!exported(st) || !named.name || !ts.isIdentifier(named.name)) continue;
      const name = named.name.text;
      if (ts.isClassDeclaration(st) && !SKIP_CLASSES.has(name)) {
        const described = describeClass(st, name);
        put(module, name, described);
        if (described.members.toJson) toJsonTypes.push(described.members.toJson.returns as string);
        tables.classes.push([module, name]);
      } else if (ts.isFunctionDeclaration(st) && module.startsWith('operations/')) {
        if (!module.split('/').includes('helpers')) misplaced.push(`${module}:${name}`);
        else if (helperNames.has(name)) throw new Error(`Helper ${name} is exported twice`);
        else {
          helperNames.add(name);
          put(module, name, call(name, st, false));
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
  // `MathJson` (io/deserialise.ts) is the union of the classes' JSON types: what a stored vec2 value can be.
  const mathJson = [...aliases.values()].find((decl) => decl.name.text === 'MathJson');
  if (!mathJson || named(mathJson) !== 'MathJson') throw new Error('MathJson is missing from io/deserialise.ts');
  const jsonTypes: string[] = (types.MathJson as { or: string[] }).or;
  const unlisted = toJsonTypes.filter((json) => !jsonTypes.includes(json));
  if (unlisted.length > 0) throw new Error(`MathJson lacks ${unlisted.join(', ')}`);

  const namedTypes = sorted(
    Object.fromEntries(Object.entries(types).filter(([, body]) => body)) as Record<string, Type>,
  );
  // Every stored number has a semantic type: parameters and JSON types may not use a bare `number`.
  const numberIn = (type: unknown, seen = new Set<string>()): boolean =>
    typeof type === 'string'
      ? type === 'number' || (type in namedTypes && !seen.has(type) && numberIn(namedTypes[type], seen.add(type)))
      : !!type && typeof type === 'object' && Object.values(type).some((child) => numberIn(child, seen));
  const untyped = jsonTypes.filter((json) => numberIn(namedTypes[json]));
  const check = (id: string, params: unknown) =>
    Object.entries(params ?? {}).forEach(([p, slot]) => numberIn(slot) && untyped.push(`${id}(${p})`));
  (function visit(node: any, name: string) {
    if (node === null) return;
    if ('returns' in node) return check(name, node.params);
    if (!('members' in node)) return Object.entries(node).forEach(([key, child]) => visit(child, key));
    check(`${name}.new`, node.new);
    for (const [key, entry] of Object.entries<any>(node.members)) {
      check(`${name}.${key}`, entry?.params);
    }
  })(modules, '');
  if (untyped.length > 0) throw new Error(`Bare \`number\` (use a type from core/numbers.ts): ${untyped.join(', ')}`);
  return { numbers: NUMBERS, types: namedTypes, modules: sortTree(modules), tables, skipped };
}

// ---- writing: folders, files, classes and `members` expanded; every entry on one line ----
const one = (value: unknown): string =>
  value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(one).join(', ')}]`
      : Object.keys(value).length === 0
        ? '{}'
        : `{ ${Object.entries(value)
            .map(([key, item]) => `${JSON.stringify(key)}: ${one(item)}`)
            .join(', ')} }`;
const block = (entries: [string, string][], indent: number) =>
  `{\n${entries.map(([key, text]) => `${'  '.repeat(indent + 1)}${JSON.stringify(key)}: ${text}`).join(',\n')}\n${'  '.repeat(indent)}}`;
const writeNode = (node: any, indent: number): string => {
  if (node === null || 'returns' in node) return one(node);
  if (!('members' in node))
    return block(
      Object.entries(node).map(([key, child]) => [key, writeNode(child, indent + 1)]),
      indent,
    );
  const head = Object.entries(node)
    .filter(([key]) => key !== 'members')
    .map(([key, v]) => [key, one(v)] as [string, string]);
  const members = Object.entries(node.members).map(([key, entry]) => [key, one(entry)] as [string, string]);
  return block([...head, ['members', block(members, indent + 1)]], indent);
};

export const schemaFiles = {
  schema: path.join(schemaDir, 'vec2.schema.json'),
  dense: path.join(schemaDir, 'vec2.dense.json'),
  bindings: path.join(schemaDir, 'bindings.ts'),
};

export async function renderSchemaFiles(): Promise<Record<keyof typeof schemaFiles, string> & { skipped: string[] }> {
  const { numbers, types, modules, tables, skipped } = generateSchema();
  const schema = [
    '{',
    '  "format": "vec2-schema",',
    '  "version": 2,',
    `  "numbers": ${block(
      Object.entries(numbers).map(([key, ranges]) => [key, one(ranges)]),
      1,
    )},`,
    `  "types": ${block(
      Object.entries(types).map(([key, body]) => [key, one(body)]),
      1,
    )},`,
    `  "modules": ${writeNode(modules, 1)}`,
    '}',
    '',
  ].join('\n');
  const imports = new Map<string, string[]>();
  for (const [module, name] of [...tables.classes, ...tables.helpers])
    imports.set(module, [...(imports.get(module) ?? []), name]);
  const names = (list: [string, string][]) => list.map(([, name]) => name).sort();
  const bindings = [
    '// Generated by scripts/vec2-schema.ts; do not edit. Regenerate with `bun run schema`.',
    ...[...imports]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, list]) => `import { ${list.sort().join(', ')} } from '../src/${module}';`),
    "import { defaultRegistry } from '../src/io/default-registry';",
    "import type { MathJson } from '../src/io/deserialise';",
    '',
    '/** The recordable vec2 classes by name. */',
    `export const classes = { ${names(tables.classes).join(', ')} } as const;`,
    '',
    '/** Helper functions by name. */',
    `export const helpers = { ${names(tables.helpers).join(', ')} } as const;`,
    '',
    '/** Every class and helper by name, for code that imports them (the playground prints such code). */',
    `export { ${[...names(tables.classes), ...names(tables.helpers)].sort().join(', ')} };`,
    `export type { ${Object.keys(NUMBERS).join(', ')} } from '../src/core/numbers';`,
    '',
    '/** A vec2 value from its JSON (`toJson()`): how printed code writes a stored value. */',
    'export const value = (json: MathJson): any => defaultRegistry.decode(json);',
    '',
  ].join('\n');
  const config = (await prettier.resolveConfig(schemaFiles.bindings)) ?? {};
  const dense = renderDenseSchema(JSON.parse(schema));
  return {
    schema,
    dense,
    bindings: await prettier.format(bindings, { ...config, filepath: schemaFiles.bindings }),
    skipped,
  };
}

if (import.meta.main) {
  const { skipped, ...rendered } = await renderSchemaFiles();
  const keys = Object.keys(schemaFiles) as (keyof typeof schemaFiles)[];
  const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
  const stale = keys.filter((key) => read(schemaFiles[key]) !== rendered[key]);
  if (process.argv.includes('--check')) {
    if (stale.length > 0) {
      console.error(
        `Stale: ${stale.map((key) => path.relative(repoRoot, schemaFiles[key])).join(', ')}. Run \`bun run schema\`.`,
      );
      process.exit(1);
    }
    console.log('vec2 schema is up to date.');
  } else {
    for (const key of stale) writeFileSync(schemaFiles[key], rendered[key]);
    console.log(
      `vec2 schema written (${rendered.schema.split('\n').length} lines). Not recordable:\n  ${skipped.join('\n  ')}`,
    );
  }
}
