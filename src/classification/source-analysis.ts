import fs from 'node:fs';
import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

export interface ComponentSourceAnalysis {
  jsxElementCount: number;
  hasSpreadAttributes: boolean;
  /**
   * True when the component renders a single root JSX element whose *only*
   * dynamic content is a `{children}` / `{props.children}` expression —
   * classic thin-wrapper pattern.
   */
  isRendersOnlyChildren: boolean;
  /**
   * Number of JSX elements at the *top level* of the return statement.
   * Layout wrappers typically have 1 root + a few structural shells.
   */
  topLevelJSXDepth: number;
}

const analysisCache = new Map<string, ComponentSourceAnalysis | null>();

export function analyzeComponentSource(
  resolvedPath: string
): ComponentSourceAnalysis | null {
  const cached = analysisCache.get(resolvedPath);
  if (cached !== undefined) {
    return cached;
  }

  let code: string;
  try {
    code = fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    analysisCache.set(resolvedPath, null);
    return null;
  }

  try {
    const ast = parse(code, {
      jsx: true,
      loc: false,
      range: false,
      tokens: false,
      comment: false,
      errorOnUnknownASTType: false,
    });

    let jsxElementCount = 0;
    let hasSpreadAttributes = false;

    walkAst(ast, node => {
      if (node.type === 'JSXOpeningElement') {
        jsxElementCount++;
      }
      if (node.type === 'JSXSpreadAttribute') {
        hasSpreadAttributes = true;
      }
    });

    const isRendersOnlyChildren = detectRendersOnlyChildren(ast);
    const topLevelJSXDepth = detectTopLevelJSXDepth(ast);

    const result: ComponentSourceAnalysis = {
      jsxElementCount,
      hasSpreadAttributes,
      isRendersOnlyChildren,
      topLevelJSXDepth,
    };
    analysisCache.set(resolvedPath, result);
    return result;
  } catch {
    analysisCache.set(resolvedPath, null);
    return null;
  }
}

export function clearComponentSourceAnalysisCache(): void {
  analysisCache.clear();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns true when every return-statement JSX root contains *only* spread
 * attributes and/or a {children} / {props.children} expression — i.e. the
 * component is a thin pass-through wrapper.
 */
function detectRendersOnlyChildren(ast: TSESTree.Program): boolean {
  const returnedJSX: TSESTree.JSXElement[] = [];

  // Collect all top-level JSX elements from return statements inside functions
  walkAst(ast, node => {
    if (node.type === 'ReturnStatement' && node.argument) {
      const jsxRoot = unwrapJSX(node.argument as TSESTree.Node);
      if (jsxRoot) {
        returnedJSX.push(jsxRoot);
      }
    }
  });

  if (returnedJSX.length === 0) {
    return false;
  }

  return returnedJSX.every(jsx => {
    const children = jsx.children;
    if (children.length === 0) {
      return true; // self-closing with spread props
    }
    // All children must be either whitespace text or {children}/{props.children}
    return children.every(child => {
      if (child.type === 'JSXText') {
        return child.value.trim() === '';
      }
      if (child.type === 'JSXExpressionContainer') {
        return isChildrenExpression(child.expression);
      }
      return false;
    });
  });
}

function isChildrenExpression(expr: TSESTree.Node | TSESTree.JSXEmptyExpression): boolean {
  // {children}
  if (expr.type === 'Identifier' && (expr as TSESTree.Identifier).name === 'children') {
    return true;
  }
  // {props.children}
  if (
    expr.type === 'MemberExpression' &&
    (expr as TSESTree.MemberExpression).object.type === 'Identifier' &&
    ((expr as TSESTree.MemberExpression).object as TSESTree.Identifier).name === 'props' &&
    (expr as TSESTree.MemberExpression).property.type === 'Identifier' &&
    ((expr as TSESTree.MemberExpression).property as TSESTree.Identifier).name === 'children'
  ) {
    return true;
  }
  return false;
}

/**
 * Counts the depth of the outermost JSX tree returned from functions.
 * Shallow depth (1-3) is characteristic of layout wrappers.
 * We use the maximum depth across all return statements.
 */
function detectTopLevelJSXDepth(ast: TSESTree.Program): number {
  let maxDepth = 0;

  walkAst(ast, node => {
    if (node.type === 'ReturnStatement' && node.argument) {
      const jsxRoot = unwrapJSX(node.argument as TSESTree.Node);
      if (jsxRoot) {
        const depth = jsxTreeDepth(jsxRoot);
        if (depth > maxDepth) maxDepth = depth;
      }
    }
  });

  return maxDepth;
}

function jsxTreeDepth(node: TSESTree.JSXElement | TSESTree.JSXFragment, depth = 1): number {
  let max = depth;
  for (const child of node.children) {
    if (child.type === 'JSXElement') {
      const d = jsxTreeDepth(child, depth + 1);
      if (d > max) max = d;
    } else if (child.type === 'JSXFragment') {
      const d = jsxTreeDepth(child, depth + 1);
      if (d > max) max = d;
    }
  }
  return max;
}

function unwrapJSX(node: TSESTree.Node): TSESTree.JSXElement | null {
  if (node.type === 'JSXElement') {
    return node as TSESTree.JSXElement;
  }
  // Parenthesized: (  <Foo/> )
  if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
    return unwrapJSX((node as TSESTree.TSAsExpression).expression);
  }
  return null;
}

// ── Generic AST walker ─────────────────────────────────────────────────────────

function walkAst(node: unknown, visitor: (node: TSESTree.Node) => void): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  const candidate = node as Record<string, unknown>;
  if (typeof candidate.type === 'string') {
    visitor(candidate as unknown as TSESTree.Node);
  }

  for (const value of Object.values(candidate)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        walkAst(child, visitor);
      }
    } else if (value && typeof value === 'object') {
      walkAst(value, visitor);
    }
  }
}
