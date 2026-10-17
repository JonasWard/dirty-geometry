#!/usr/bin/env bun
/**
 * Generates the vec2 operation schema from the TypeScript source.
 *
 * TypeScript keeps no parameter names or types at runtime, so the schema is extracted at build time
 * with the compiler API and committed:
 * - packages/vec2/schema/vec2.schema.json: every exported class (constructor and public members) and
 *   every function in an `operations/**\/helpers/` folder, with parameter names and JSON type descriptions;
 * - packages/vec2/schema/bindings.ts: the runtime table from class / helper name to implementation;
 * - packages/vec2/schema/ids.ts: the operation ids as a string union, so policy.ts is type-checked.
 *
 * Rule: an operation is a class member or a helper. An exported function anywhere else in `operations/`
 * fails the build.
 *
 *   bun run schema          # regenerate
 *   bun run schema:check    # fail when the committed files are stale
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import ts from "typescript";
import { policy } from "../packages/vec2/schema/policy";
import type {
  CallableSchema,
  ClassSchema,
  MemberSchema,
  ParamSchema,
  TypeRef,
  Vec2Schema,
} from "../packages/vec2/schema/types";

const repoRoot = path.resolve(import.meta.dir, "..");
const packageRoot = path.join(repoRoot, "packages/vec2");
const srcRoot = path.join(packageRoot, "src");
const schemaDir = path.join(packageRoot, "schema");

/** Never part of the schema: the recording layer itself. */
const SKIPPED_FOLDERS = ["recording/"];
const isOperationsModule = (module: string) => module.startsWith("operations/");
const isHelperModule = (module: string) =>
  isOperationsModule(module) && module.split("/").includes("helpers");

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return name.endsWith(".ts") && !name.endsWith(".d.ts") ? [full] : [];
  });
}

const moduleOf = (file: string) =>
  path.relative(srcRoot, file).replace(/\\/g, "/").replace(/\.ts$/, "");

export function generateSchema(): {
  schema: Vec2Schema;
  bindings: string;
  ids: string;
} {
  const files = listSources(srcRoot).filter(
    (file) => !SKIPPED_FOLDERS.some((dir) => moduleOf(file).startsWith(dir)),
  );
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
  const sources = files
    .map((file) => ({
      source: program.getSourceFile(file)!,
      module: moduleOf(file),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));

  // Pass 1: every exported class, so a parameter of type `Vec2` is described as a class reference.
  const classSymbols = new Map<ts.Symbol, string>();
  for (const { source } of sources) {
    for (const statement of source.statements) {
      if (
        ts.isClassDeclaration(statement) &&
        statement.name &&
        isExported(statement)
      ) {
        classSymbols.set(
          checker.getSymbolAtLocation(statement.name)!,
          statement.name.text,
        );
      }
    }
  }
  const describe = (type: ts.Type): TypeRef =>
    describeType(checker, type, classSymbols, new Set());

  /** Parameters and return type of a signature, or why it cannot be recorded. */
  function callable(
    id: string,
    owner: string | null,
    signature: ts.Signature,
    returns?: ts.Type,
  ): CallableSchema {
    const params: ParamSchema[] = signature.getParameters().map((symbol) => {
      const declaration = symbol.valueDeclaration as ts.ParameterDeclaration;
      const rest = !!declaration.dotDotDotToken;
      let type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      if (rest && checker.isArrayType(type))
        type = checker.getTypeArguments(type as ts.TypeReference)[0]!;
      const optional = !!declaration.questionToken || !!declaration.initializer;
      return {
        name: symbol.name,
        type: describe(optional ? checker.getNonNullableType(type) : type),
        ...(optional ? { optional: true as const } : {}),
        ...(rest ? { rest: true as const } : {}),
      };
    });
    return entry(
      id,
      owner,
      params,
      describe(returns ?? signature.getReturnType()),
    );
  }

  function entry(
    id: string,
    owner: string | null,
    params: ParamSchema[],
    returns: TypeRef,
  ): CallableSchema {
    const reason =
      policyReason(id, owner) ??
      params
        .map((param) => unsupportedIn(param.type, `parameter ${param.name}`))
        .find(Boolean) ??
      unsupportedIn(returns, "return value") ??
      (returns.kind === "void" ? "returns nothing" : null);
    if (reason) return { reason };
    return { ...(params.length > 0 ? { params } : {}), returns };
  }

  // Pass 2: describe classes and helpers.
  const classes: Record<string, ClassSchema> = {};
  const helpers: Record<string, Record<string, CallableSchema>> = {};
  const helperNames = new Map<string, string>();
  const misplaced: string[] = [];

  for (const { source, module } of sources) {
    for (const statement of source.statements) {
      if (
        ts.isClassDeclaration(statement) &&
        statement.name &&
        isExported(statement)
      ) {
        classes[statement.name.text] = describeClass(statement, module);
      } else if (
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        isExported(statement)
      ) {
        if (!isOperationsModule(module)) continue;
        const name = statement.name.text;
        if (!isHelperModule(module)) {
          misplaced.push(`${module}:${name}`);
          continue;
        }
        if (helperNames.has(name))
          throw new Error(
            `Helper ${name} is exported by both ${helperNames.get(name)} and ${module}`,
          );
        helperNames.set(name, module);
        const signature = checker.getSignatureFromDeclaration(statement)!;
        (helpers[module] ??= {})[name] = callable(
          `${module}:${name}`,
          null,
          signature,
        );
      }
    }
  }
  if (misplaced.length > 0) {
    throw new Error(
      `Operations must be class members or live in a helpers/ folder. Move or wrap: ${misplaced.join(", ")}`,
    );
  }

  function describeClass(
    node: ts.ClassDeclaration,
    module: string,
  ): ClassSchema {
    const owner = node.name!.text;
    const classSymbol = checker.getSymbolAtLocation(node.name!)!;
    const instanceType = checker.getDeclaredTypeOfSymbol(classSymbol);
    const typeTag = staticTypeTag(node);
    const members: Record<string, MemberSchema> = {};

    let created: CallableSchema | undefined;
    const constructorDecl = node.members.find(ts.isConstructorDeclaration);
    if (!constructorDecl || isPublic(constructorDecl)) {
      const [signature] = checker
        .getTypeOfSymbolAtLocation(classSymbol, node)
        .getConstructSignatures();
      if (signature)
        created = callable(`${owner}.new`, owner, signature, instanceType);
    }

    const add = (
      name: string,
      isStatic: boolean,
      value: boolean,
      schema: CallableSchema,
    ) => {
      members[name] = {
        ...(isStatic ? { static: true as const } : {}),
        ...(value ? { value: true as const } : {}),
        ...schema,
      };
    };

    for (const member of node.members) {
      if (
        !member.name ||
        !isPublic(member) ||
        ts.isConstructorDeclaration(member)
      )
        continue;
      const name = member.name.getText();
      if (name.startsWith("_") || name.startsWith("#") || members[name])
        continue;
      const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword);
      const id = `${owner}${isStatic ? "." : "#"}${name}`;

      if (ts.isMethodDeclaration(member)) {
        const overloaded = (
          checker.getSymbolAtLocation(member.name)?.getDeclarations() ?? []
        ).some(
          (declaration) =>
            ts.isMethodDeclaration(declaration) && !declaration.body,
        );
        if (member.asteriskToken || overloaded) {
          add(name, isStatic, false, {
            reason: member.asteriskToken
              ? "generator method"
              : "overloaded method",
          });
        } else {
          add(
            name,
            isStatic,
            false,
            callable(id, owner, checker.getSignatureFromDeclaration(member)!),
          );
        }
      } else if (
        ts.isPropertyDeclaration(member) ||
        ts.isGetAccessorDeclaration(member)
      ) {
        if (name === "type") continue; // the type tag is metadata, not an operation
        const type = checker.getTypeAtLocation(member);
        if (type.getCallSignatures().length > 0) continue;
        add(name, isStatic, true, entry(id, owner, [], describe(type)));
      }
    }

    // Constructor parameter properties (`constructor(public readonly from: Vec2)`) are fields too.
    for (const parameter of constructorDecl?.parameters ?? []) {
      if (
        !ts.isIdentifier(parameter.name) ||
        !isPublic(parameter) ||
        !hasAnyModifier(parameter)
      )
        continue;
      const name = parameter.name.text;
      add(
        name,
        false,
        true,
        entry(
          `${owner}#${name}`,
          owner,
          [],
          describe(checker.getTypeAtLocation(parameter)),
        ),
      );
    }

    return {
      module,
      ...(typeTag ? { typeTag } : {}),
      ...(created ? { new: created } : {}),
      members: sortObject(members),
    };
  }

  const body = {
    classes: sortObject(classes),
    helpers: sortObject(
      Object.fromEntries(
        Object.entries(helpers).map(([module, fns]) => [
          module,
          sortObject(fns),
        ]),
      ),
    ),
  };
  const hash = `sha256:${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16)}`;
  const schema: Vec2Schema = {
    format: "vec2-schema",
    version: 2,
    hash,
    ...body,
  };
  return {
    schema,
    bindings: renderBindings(schema),
    ids: renderIds(operationIds(schema)),
  };
}

function policyReason(id: string, owner: string | null): string | null {
  const member = id.replace(/^.*[.#:]/, "");
  const reason =
    (owner
      ? (policy.excludeClasses as Record<string, string>)[owner]
      : undefined) ??
    (policy.excludeMembers as Record<string, string>)[member] ??
    (policy.excludeOperations as Record<string, string>)[id];
  return reason ? `policy: ${reason}` : null;
}

function unsupportedIn(type: TypeRef, label: string): string | null {
  switch (type.kind) {
    case "unsupported":
      return `${label} has an unsupported type (${type.text})`;
    case "array":
      return unsupportedIn(type.of, label);
    case "tuple":
      return (
        type.items.map((item) => unsupportedIn(item, label)).find(Boolean) ??
        null
      );
    case "union":
      return (
        type.of.map((item) => unsupportedIn(item, label)).find(Boolean) ?? null
      );
    case "object":
      return (
        Object.values(type.fields)
          .map((field) => unsupportedIn(field.type, label))
          .find(Boolean) ?? null
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
  const recurse = (inner: ts.Type, next = seen) =>
    describeType(checker, inner, classSymbols, next);
  const isBooleanLiteral = (member: ts.Type) =>
    (member.getFlags() & ts.TypeFlags.BooleanLiteral) !== 0;

  if (flags & ts.TypeFlags.Number) return { kind: "number" };
  if (flags & ts.TypeFlags.String) return { kind: "string" };
  if (flags & ts.TypeFlags.Boolean) return { kind: "boolean" };
  if (flags & ts.TypeFlags.Null) return { kind: "null" };
  if (flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined))
    return { kind: "void" };
  if (type.isNumberLiteral() || type.isStringLiteral())
    return { kind: "literal", value: type.value };
  if (isBooleanLiteral(type))
    return { kind: "literal", value: text() === "true" };

  // `Readonly<T>` (frozen constants) describes the same data as `T`.
  if (
    type.aliasSymbol?.getName() === "Readonly" &&
    type.aliasTypeArguments?.length === 1
  ) {
    return recurse(type.aliasTypeArguments[0]!);
  }
  // A generic parameter is described by its constraint (`T extends Polyline2 | Polygon2`).
  if (flags & ts.TypeFlags.TypeParameter) {
    const constraint = checker.getBaseConstraintOfType(type);
    if (
      constraint &&
      constraint !== type &&
      !(constraint.getFlags() & ts.TypeFlags.Unknown)
    )
      return recurse(constraint);
  }

  if (type.isUnion()) {
    const members = type.types.filter(
      (member) => !(member.getFlags() & ts.TypeFlags.Undefined),
    );
    // TypeScript stores `boolean` as `true | false`; fold the pair back.
    const booleans = members.filter(isBooleanLiteral);
    const foldBoolean = booleans.length === 2;
    const of: TypeRef[] = [
      ...(foldBoolean ? [{ kind: "boolean" } as const] : []),
      ...members
        .filter((member) => !(foldBoolean && isBooleanLiteral(member)))
        .map((member) => recurse(member)),
    ];
    return of.length === 1 ? of[0]! : { kind: "union", of };
  }

  if (checker.isTupleType(type)) {
    return {
      kind: "tuple",
      items: checker
        .getTypeArguments(type as ts.TypeReference)
        .map((item) => recurse(item)),
    };
  }
  if (checker.isArrayType(type)) {
    return {
      kind: "array",
      of: recurse(checker.getTypeArguments(type as ts.TypeReference)[0]!),
    };
  }

  const symbol = type.getSymbol() ?? type.aliasSymbol;
  const className = symbol && classSymbols.get(symbol);
  if (className) return { kind: "class", type: className };

  if (
    flags &
    (ts.TypeFlags.Any |
      ts.TypeFlags.Unknown |
      ts.TypeFlags.Never |
      ts.TypeFlags.TypeParameter)
  ) {
    return { kind: "unsupported", text: text() };
  }
  if (
    type.getCallSignatures().length > 0 ||
    type.getConstructSignatures().length > 0
  ) {
    return { kind: "unsupported", text: `function ${text()}` };
  }
  // Plain objects, and intersections of them (`Fit & { rectangles: ... }`), are described field by field.
  if (flags & ts.TypeFlags.Object || type.isIntersection()) {
    const name = symbol?.getName();
    if (
      name &&
      [
        "Map",
        "Set",
        "WeakMap",
        "Generator",
        "Iterator",
        "IterableIterator",
        "Promise",
      ].includes(name)
    ) {
      return { kind: "unsupported", text: text() };
    }
    if (symbol && isNonExportedClass(symbol))
      return { kind: "unsupported", text: text() };
    if (seen.has(type) || seen.size > 6)
      return { kind: "unsupported", text: `recursive ${text()}` };
    const next = new Set(seen).add(type);
    const fields: Record<string, { type: TypeRef; optional?: true }> = {};
    for (const property of checker.getPropertiesOfType(type)) {
      const declaration =
        property.valueDeclaration ?? property.declarations?.[0];
      if (!declaration) continue;
      const propertyType = checker.getTypeOfSymbolAtLocation(
        property,
        declaration,
      );
      if (propertyType.getCallSignatures().length > 0) continue; // methods of a result object are not data
      const optional = (property.getFlags() & ts.SymbolFlags.Optional) !== 0;
      fields[property.name] = {
        type: recurse(
          optional ? checker.getNonNullableType(propertyType) : propertyType,
          next,
        ),
        ...(optional ? { optional: true as const } : {}),
      };
    }
    return { kind: "object", fields };
  }
  return { kind: "unsupported", text: text() };
}

/** A class that is not a vec2 export (e.g. a private helper class) cannot be described as data. */
function isNonExportedClass(symbol: ts.Symbol): boolean {
  return (symbol.getDeclarations() ?? []).some((declaration) =>
    ts.isClassDeclaration(declaration),
  );
}

const modifiersOf = (node: ts.Node) =>
  ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  modifiersOf(node).some((modifier) => modifier.kind === kind);
const hasAnyModifier = (node: ts.Node) => modifiersOf(node).length > 0;
const isExported = (node: ts.Node) =>
  hasModifier(node, ts.SyntaxKind.ExportKeyword);
const isPublic = (node: ts.Node) =>
  !hasModifier(node, ts.SyntaxKind.PrivateKeyword) &&
  !hasModifier(node, ts.SyntaxKind.ProtectedKeyword);

function staticTypeTag(node: ts.ClassDeclaration): string | null {
  for (const member of node.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      hasModifier(member, ts.SyntaxKind.StaticKeyword) &&
      member.name.getText() === "type" &&
      member.initializer
    ) {
      const initializer = ts.isAsExpression(member.initializer)
        ? member.initializer.expression
        : member.initializer;
      if (ts.isStringLiteral(initializer)) return initializer.text;
    }
  }
  return null;
}

function sortObject<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Operation ids in the same order as `schema/operations.ts` lists them. */
function operationIds(schema: Vec2Schema): string[] {
  return [
    ...Object.entries(schema.classes).flatMap(([owner, cls]) => [
      ...(cls.new ? [`${owner}.new`] : []),
      ...Object.entries(cls.members).map(
        ([name, member]) => `${owner}${member.static ? "." : "#"}${name}`,
      ),
    ]),
    ...Object.entries(schema.helpers).flatMap(([module, fns]) =>
      Object.keys(fns).map((name) => `${module}:${name}`),
    ),
  ];
}

function renderBindings(schema: Vec2Schema): string {
  const imports = new Map<string, string[]>();
  const importFrom = (module: string, name: string) =>
    imports.set(module, [...(imports.get(module) ?? []), name]);
  for (const [name, { module }] of Object.entries(schema.classes))
    importFrom(module, name);
  for (const [module, fns] of Object.entries(schema.helpers))
    Object.keys(fns).forEach((name) => importFrom(module, name));

  return [
    "// Generated by scripts/vec2-schema.ts; do not edit. Regenerate with `bun run schema`.",
    ...[...imports.keys()]
      .sort()
      .map(
        (module) =>
          `import { ${[...imports.get(module)!].sort().join(", ")} } from '../src/${module}';`,
      ),
    "",
    "/** Exported vec2 classes by name. */",
    "export const classes = {",
    ...Object.keys(schema.classes).map((name) => `  ${name},`),
    "} as const;",
    "",
    "/** Helper functions by `<module>:<name>`. */",
    "export const helpers = {",
    ...Object.entries(schema.helpers).flatMap(([module, fns]) =>
      Object.keys(fns).map((name) => `  '${module}:${name}': ${name},`),
    ),
    "} as const;",
    "",
  ].join("\n");
}

function renderIds(ids: readonly string[]): string {
  return [
    "// Generated by scripts/vec2-schema.ts; do not edit. Regenerate with `bun run schema`.",
    "/** Every operation id in vec2.schema.json. */",
    "export type OperationId =",
    ...ids.map(
      (id, index) => `  | '${id}'${index === ids.length - 1 ? ";" : ""}`,
    ),
    "",
  ].join("\n");
}

export const schemaFiles = {
  schema: path.join(schemaDir, "vec2.schema.json"),
  bindings: path.join(schemaDir, "bindings.ts"),
  ids: path.join(schemaDir, "ids.ts"),
};

/** The generated files, formatted like the rest of `packages/` so `format:check` accepts them. */
export async function renderSchemaFiles(): Promise<
  Record<keyof typeof schemaFiles, string>
> {
  const { schema, bindings, ids } = generateSchema();
  const config = (await prettier.resolveConfig(schemaFiles.bindings)) ?? {};
  const format = (text: string, filepath: string) =>
    prettier.format(text, { ...config, filepath });
  return {
    schema: await format(JSON.stringify(schema), schemaFiles.schema),
    bindings: await format(bindings, schemaFiles.bindings),
    ids: await format(ids, schemaFiles.ids),
  };
}

if (import.meta.main) {
  const rendered = await renderSchemaFiles();
  const check = process.argv.includes("--check");
  const stale = (
    Object.keys(schemaFiles) as (keyof typeof schemaFiles)[]
  ).filter((key) => {
    let current = "";
    try {
      current = readFileSync(schemaFiles[key], "utf8");
    } catch {}
    return current !== rendered[key];
  });
  if (check) {
    if (stale.length > 0) {
      console.error(
        `Stale schema files: ${stale.map((key) => path.relative(repoRoot, schemaFiles[key])).join(", ")}. Run \`bun run schema\`.`,
      );
      process.exit(1);
    }
    console.log("vec2 schema is up to date.");
  } else {
    for (const key of stale) writeFileSync(schemaFiles[key], rendered[key]);
    const parsed = JSON.parse(rendered.schema) as Vec2Schema;
    const entries = [
      ...Object.values(parsed.classes).flatMap((cls) => [
        ...(cls.new ? [cls.new] : []),
        ...Object.values(cls.members),
      ]),
      ...Object.values(parsed.helpers).flatMap((fns) => Object.values(fns)),
    ];
    console.log(
      `vec2 schema: ${entries.length} operations, ${entries.filter((op) => !op.reason).length} recordable (${parsed.hash}).`,
    );
  }
}
