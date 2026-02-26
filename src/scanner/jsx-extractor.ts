import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { ImportEntry, ImportMap, JSXUsageRecord } from '../types.js';

type ASTNode = TSESTree.Node;

// ─── Import Extraction ────────────────────────────────────────────────────────

export function extractImports(ast: TSESTree.Program): ImportMap {
  const importMap: ImportMap = new Map();

  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const source = node.source.value as string;

    for (const specifier of node.specifiers) {
      let entry: ImportEntry;

      if (specifier.type === 'ImportDefaultSpecifier') {
        entry = {
          localName: specifier.local.name,
          importedName: 'default',
          source,
          type: 'default',
        };
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        entry = {
          localName: specifier.local.name,
          importedName: '*',
          source,
          type: 'namespace',
        };
      } else if (specifier.type === 'ImportSpecifier') {
        const importedName =
          specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value;
        entry = {
          localName: specifier.local.name,
          importedName,
          source,
          type: 'named',
        };
      } else {
        continue;
      }

      importMap.set(entry.localName, entry);
    }
  }

  return importMap;
}

// ─── JSX Extraction ───────────────────────────────────────────────────────────

export function extractJSXUsages(
  ast: TSESTree.Program,
  importMap: ImportMap,
  filePath: string
): JSXUsageRecord[] {
  const usages: JSXUsageRecord[] = [];
  visitNode(ast, importMap, filePath, usages);
  return usages;
}

function visitNode(
  node: ASTNode,
  importMap: ImportMap,
  filePath: string,
  usages: JSXUsageRecord[]
): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'JSXOpeningElement') {
    const usage = extractJSXUsage(node, importMap, filePath);
    if (usage) usages.push(usage);
    // Still visit children (props may have nested JSX)
    visitChildren(node, importMap, filePath, usages);
    return;
  }

  visitChildren(node, importMap, filePath, usages);
}

function visitChildren(
  node: ASTNode,
  importMap: ImportMap,
  filePath: string,
  usages: JSXUsageRecord[]
): void {
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = (node as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          visitNode(item as ASTNode, importMap, filePath, usages);
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      visitNode(child as ASTNode, importMap, filePath, usages);
    }
  }
}

function extractJSXUsage(
  node: TSESTree.JSXOpeningElement,
  importMap: ImportMap,
  filePath: string
): JSXUsageRecord | null {
  const nameNode = node.name;

  let componentName: string;
  let localName: string;
  let importEntry: ImportEntry | null = null;

  if (nameNode.type === 'JSXIdentifier') {
    localName = nameNode.name;
    componentName = nameNode.name;

    // Skip lowercase = HTML native, handled by category
    // But still record it for completeness — categorizer will mark it html-native
    importEntry = importMap.get(localName) ?? null;

  } else if (nameNode.type === 'JSXMemberExpression') {
    // e.g. <Select.Option> or <DS.Button>
    const { objectName, propertyName } = flattenMemberExpression(nameNode);
    localName = objectName;
    componentName = `${objectName}.${propertyName}`;

    // Look up the root object in import map
    importEntry = importMap.get(objectName) ?? null;

  } else if (nameNode.type === 'JSXNamespacedName') {
    // e.g. <foo:bar> — extremely rare, skip
    return null;
  } else {
    return null;
  }

  // Skip Fragment syntax: <> or <React.Fragment>
  if (componentName === 'React.Fragment' || componentName === 'Fragment') {
    return null;
  }

  // Extract props
  const props: string[] = [];
  let hasSpreadProps = false;

  for (const attr of node.attributes) {
    if (attr.type === 'JSXAttribute') {
      if (attr.name.type === 'JSXIdentifier') {
        props.push(attr.name.name);
      } else if (attr.name.type === 'JSXNamespacedName') {
        props.push(`${attr.name.namespace.name}:${attr.name.name.name}`);
      }
    } else if (attr.type === 'JSXSpreadAttribute') {
      hasSpreadProps = true;
    }
  }

  const loc = node.loc?.start ?? { line: 0, column: 0 };

  return {
    componentName,
    localName,
    importEntry,
    filePath,
    line: loc.line,
    column: loc.column,
    props,
    hasSpreadProps,
  };
}

function flattenMemberExpression(
  node: TSESTree.JSXMemberExpression
): { objectName: string; propertyName: string } {
  // Get the root object name
  let obj: TSESTree.JSXMemberExpression | TSESTree.JSXIdentifier = node.object;
  const parts: string[] = [node.property.name];

  while (obj.type === 'JSXMemberExpression') {
    parts.unshift(obj.property.name);
    obj = obj.object;
  }

  return {
    objectName: (obj as TSESTree.JSXIdentifier).name,
    propertyName: parts.join('.'),
  };
}
