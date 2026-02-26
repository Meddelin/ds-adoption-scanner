import fs from 'node:fs';
import { parse } from '@typescript-eslint/typescript-estree';
import type { FileParseResult } from '../types.js';
import { extractImports, extractJSXUsages } from './jsx-extractor.js';

export async function parseFile(filePath: string): Promise<FileParseResult> {
  const errors: string[] = [];

  let code: string;
  try {
    code = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      filePath,
      imports: new Map(),
      jsxUsages: [],
      errors: [`Failed to read file: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  try {
    const ast = parse(code, {
      jsx: true,
      loc: true,
      range: true,
      tokens: false,
      comment: false,
      errorOnUnknownASTType: false,
    });

    const imports = extractImports(ast);
    const jsxUsages = extractJSXUsages(ast, imports, filePath);

    return {
      filePath,
      imports,
      jsxUsages,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      filePath,
      imports: new Map(),
      jsxUsages: [],
      errors: [`Parse error: ${message}`],
    };
  }
}
