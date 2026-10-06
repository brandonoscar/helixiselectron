import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

/**
 * Test helper: find call expressions in a source file by walking its syntax
 * tree. Tripwires use this instead of matching source text, because a
 * comment that explains a rule quotes the very call it forbids.
 */
export interface FoundCall {
  /** Full call text, e.g. `cdpPortFor(process.env, app.isPackaged)`. */
  text: string
  /** Value of the first argument when it is a string literal. */
  firstArg: string | null
  /** Name of the nearest enclosing named function, or null at top level. */
  enclosingFunction: string | null
  /** Conditions of every `if` the call sits inside, innermost first. */
  guardedBy: string[]
}

export function callsIn(file: string, callee: string, dir = join(__dirname, '..')): FoundCall[] {
  const path = join(dir, file)
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const found: FoundCall[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(src) === callee) {
      const first = node.arguments[0]
      let enclosingFunction: string | null = null
      const guardedBy: string[] = []
      for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
        if (ts.isIfStatement(p)) guardedBy.push(p.expression.getText(src))
        if (enclosingFunction === null && ts.isFunctionDeclaration(p) && p.name) {
          enclosingFunction = p.name.text
        }
      }
      found.push({
        text: node.getText(src),
        firstArg: first && ts.isStringLiteral(first) ? first.text : null,
        enclosingFunction,
        guardedBy
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return found
}

/** Names a module exports (`export const|function|class X`). */
export function exportsOf(path: string): string[] {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const names: string[] = []
  for (const stmt of src.statements) {
    const exported = ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) continue
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text)
    } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && stmt.name) {
      names.push(stmt.name.text)
    }
  }
  return names
}

/** Names a module uses from `./platform.js`: named imports, plus `ns.X`
 *  property reads on a namespace import. */
export function platformNamesUsed(path: string): string[] {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const names = new Set<string>()
  let ns: string | null = null
  for (const stmt of src.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (stmt.moduleSpecifier.text !== './platform.js') continue
    const b = stmt.importClause?.namedBindings
    if (b && ts.isNamespaceImport(b)) ns = b.name.text
    if (b && ts.isNamedImports(b)) for (const el of b.elements) names.add((el.propertyName ?? el.name).text)
  }
  if (ns) {
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === ns) {
        names.add(node.name.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(src)
  }
  return [...names].sort()
}

/** Every `new WebContentsView({...})` in a file, with the literal value of
 *  `webPreferences.sandbox` (null when absent or not a literal). */
export function webContentsViewSandbox(file: string, dir = join(__dirname, '..')): (boolean | null)[] {
  const path = join(dir, file)
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const out: (boolean | null)[] = []
  const prop = (obj: ts.ObjectLiteralExpression, name: string) =>
    obj.properties.find(
      (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(src) === name
    )?.initializer
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && node.expression.getText(src) === 'WebContentsView') {
      const opts = node.arguments?.[0]
      const prefs = opts && ts.isObjectLiteralExpression(opts) ? prop(opts, 'webPreferences') : undefined
      const sandbox = prefs && ts.isObjectLiteralExpression(prefs) ? prop(prefs, 'sandbox') : undefined
      out.push(
        sandbox?.kind === ts.SyntaxKind.TrueKeyword ? true : sandbox?.kind === ts.SyntaxKind.FalseKeyword ? false : null
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return out
}
