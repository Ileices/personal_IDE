// ============================================
// Symbol Extraction Patterns — per-language regex
// patterns for extracting functions, classes,
// interfaces, types, enums, variables, etc.
// Extracted from relationshipIndex.ts for modularity
// ============================================
import type { SymbolKind } from '@personal-ide/shared';

export interface SymbolPattern {
  regex: RegExp;
  kind: SymbolKind;
  nameGroup: number;
  signatureCapture?: boolean;
  exported?: (match: RegExpExecArray, line: string) => boolean;
}

export function getSymbolPatterns(language: string): SymbolPattern[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return [
        { regex: /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)/g, kind: 'function', nameGroup: 1, signatureCapture: true, exported: (m, l) => l.includes('export') },
        { regex: /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/g, kind: 'class', nameGroup: 1, exported: (m, l) => l.includes('export') },
        { regex: /(?:export\s+)?interface\s+(\w+)/g, kind: 'interface', nameGroup: 1, exported: (m, l) => l.includes('export') },
        { regex: /(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/g, kind: 'type', nameGroup: 1, exported: (m, l) => l.includes('export') },
        { regex: /(?:export\s+)?enum\s+(\w+)/g, kind: 'enum', nameGroup: 1, exported: (m, l) => l.includes('export') },
        { regex: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=/g, kind: 'variable', nameGroup: 1, exported: (m, l) => l.includes('export') },
        { regex: /(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/g, kind: 'method', nameGroup: 1 },
      ];

    case 'python':
      return [
        { regex: /(?:async\s+)?def\s+(\w+)\s*\([^)]*\)/g, kind: 'function', nameGroup: 1, signatureCapture: true },
        { regex: /class\s+(\w+)(?:\([^)]*\))?:/g, kind: 'class', nameGroup: 1 },
        { regex: /^(\w+)\s*(?::\s*\w+)?\s*=\s*/gm, kind: 'variable', nameGroup: 1 },
        { regex: /^([A-Z_][A-Z0-9_]*)\s*=\s*/gm, kind: 'constant', nameGroup: 1 },
      ];

    case 'rust':
      return [
        { regex: /(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/g, kind: 'function', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)/g, kind: 'struct', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)/g, kind: 'enum', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /(?:pub(?:\([^)]*\))?\s+)?trait\s+(\w+)/g, kind: 'trait', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)/g, kind: 'module', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /(?:pub(?:\([^)]*\))?\s+)?type\s+(\w+)/g, kind: 'type', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /(?:pub(?:\([^)]*\))?\s+)?const\s+(\w+)/g, kind: 'constant', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /impl(?:<[^>]*>)?\s+(\w+)/g, kind: 'class', nameGroup: 1 },
      ];

    case 'go':
      return [
        { regex: /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/g, kind: 'function', nameGroup: 1, exported: (m) => /^[A-Z]/.test(m[1]) },
        { regex: /type\s+(\w+)\s+struct/g, kind: 'struct', nameGroup: 1, exported: (m) => /^[A-Z]/.test(m[1]) },
        { regex: /type\s+(\w+)\s+interface/g, kind: 'interface', nameGroup: 1, exported: (m) => /^[A-Z]/.test(m[1]) },
        { regex: /var\s+(\w+)\s+/g, kind: 'variable', nameGroup: 1 },
        { regex: /const\s+(\w+)\s+/g, kind: 'constant', nameGroup: 1 },
        { regex: /type\s+(\w+)\s+(?!struct|interface)\w+/g, kind: 'type', nameGroup: 1 },
      ];

    case 'java':
      return [
        { regex: /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:synchronized\s+)?(?:\w+(?:<[^>]*>)?\s+)+(\w+)\s*\(/g, kind: 'method', nameGroup: 1 },
        { regex: /(?:public|private|protected)?\s*(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/g, kind: 'class', nameGroup: 1, exported: (m, l) => l.includes('public') },
        { regex: /(?:public|private|protected)?\s*interface\s+(\w+)/g, kind: 'interface', nameGroup: 1 },
        { regex: /(?:public|private|protected)?\s*enum\s+(\w+)/g, kind: 'enum', nameGroup: 1 },
        { regex: /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(\w+(?:<[^>]*>)?)\s+(\w+)\s*[=;]/g, kind: 'variable', nameGroup: 2 },
      ];

    case 'csharp':
      return [
        { regex: /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:virtual\s+)?(?:\w+(?:<[^>]*>)?\s+)+(\w+)\s*\(/g, kind: 'method', nameGroup: 1 },
        { regex: /(?:public|private|protected|internal)?\s*(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /(?:public|private|protected|internal)?\s*interface\s+(\w+)/g, kind: 'interface', nameGroup: 1 },
        { regex: /(?:public|private|protected|internal)?\s*enum\s+(\w+)/g, kind: 'enum', nameGroup: 1 },
        { regex: /(?:public|private|protected|internal)?\s*struct\s+(\w+)/g, kind: 'struct', nameGroup: 1 },
        { regex: /namespace\s+([\w.]+)/g, kind: 'module', nameGroup: 1 },
      ];

    case 'cpp':
    case 'c':
      return [
        { regex: /(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{/g, kind: 'function', nameGroup: 1 },
        { regex: /class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /struct\s+(\w+)/g, kind: 'struct', nameGroup: 1 },
        { regex: /enum\s+(?:class\s+)?(\w+)/g, kind: 'enum', nameGroup: 1 },
        { regex: /namespace\s+(\w+)/g, kind: 'module', nameGroup: 1 },
        { regex: /#define\s+(\w+)/g, kind: 'constant', nameGroup: 1 },
        { regex: /typedef\s+.*?\s+(\w+)\s*;/g, kind: 'type', nameGroup: 1 },
      ];

    case 'swift':
      return [
        { regex: /(?:public|private|internal|open|fileprivate)?\s*func\s+(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /(?:public|private|internal|open|fileprivate)?\s*class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /(?:public|private|internal|open|fileprivate)?\s*struct\s+(\w+)/g, kind: 'struct', nameGroup: 1 },
        { regex: /(?:public|private|internal|open|fileprivate)?\s*protocol\s+(\w+)/g, kind: 'interface', nameGroup: 1 },
        { regex: /(?:public|private|internal|open|fileprivate)?\s*enum\s+(\w+)/g, kind: 'enum', nameGroup: 1 },
      ];

    case 'kotlin':
      return [
        { regex: /(?:public|private|internal|protected)?\s*fun\s+(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /(?:public|private|internal|protected)?\s*(?:data\s+)?(?:abstract\s+)?(?:open\s+)?class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /(?:public|private|internal|protected)?\s*interface\s+(\w+)/g, kind: 'interface', nameGroup: 1 },
        { regex: /(?:public|private|internal|protected)?\s*enum\s+class\s+(\w+)/g, kind: 'enum', nameGroup: 1 },
        { regex: /(?:public|private|internal|protected)?\s*object\s+(\w+)/g, kind: 'module', nameGroup: 1 },
      ];

    case 'ruby':
      return [
        { regex: /def\s+(self\.)?(\w+[!?]?)/g, kind: 'function', nameGroup: 2 },
        { regex: /class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /module\s+(\w+)/g, kind: 'module', nameGroup: 1 },
        { regex: /(\w+)\s*=\s*/g, kind: 'variable', nameGroup: 1 },
      ];

    case 'php':
      return [
        { regex: /(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /(?:abstract\s+)?class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /interface\s+(\w+)/g, kind: 'interface', nameGroup: 1 },
        { regex: /trait\s+(\w+)/g, kind: 'trait', nameGroup: 1 },
        { regex: /namespace\s+([\w\\]+)/g, kind: 'module', nameGroup: 1 },
      ];

    case 'lua':
      return [
        { regex: /(?:local\s+)?function\s+(?:[\w.]+[.:])?(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /(\w+)\s*=\s*\{/g, kind: 'variable', nameGroup: 1 },
      ];

    case 'dart':
      return [
        { regex: /(?:static\s+)?(?:Future|Stream|void|\w+)\s+(\w+)\s*\(/g, kind: 'function', nameGroup: 1 },
        { regex: /(?:abstract\s+)?class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /enum\s+(\w+)/g, kind: 'enum', nameGroup: 1 },
        { regex: /mixin\s+(\w+)/g, kind: 'trait', nameGroup: 1 },
      ];

    case 'scala':
      return [
        { regex: /def\s+(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /(?:case\s+)?class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /trait\s+(\w+)/g, kind: 'trait', nameGroup: 1 },
        { regex: /object\s+(\w+)/g, kind: 'module', nameGroup: 1 },
      ];

    case 'elixir':
      return [
        { regex: /def[p]?\s+(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /defmodule\s+([\w.]+)/g, kind: 'module', nameGroup: 1 },
      ];

    case 'haskell':
      return [
        { regex: /^(\w+)\s+::\s+/gm, kind: 'function', nameGroup: 1 },
        { regex: /^data\s+(\w+)/gm, kind: 'type', nameGroup: 1 },
        { regex: /^class\s+(\w+)/gm, kind: 'class', nameGroup: 1 },
        { regex: /^type\s+(\w+)/gm, kind: 'type', nameGroup: 1 },
        { regex: /^newtype\s+(\w+)/gm, kind: 'type', nameGroup: 1 },
        { regex: /^module\s+([\w.]+)/gm, kind: 'module', nameGroup: 1 },
      ];

    case 'zig':
      return [
        { regex: /(?:pub\s+)?fn\s+(\w+)/g, kind: 'function', nameGroup: 1, exported: (m, l) => l.includes('pub') },
        { regex: /const\s+(\w+)\s*=\s*struct/g, kind: 'struct', nameGroup: 1 },
        { regex: /const\s+(\w+)\s*=\s*enum/g, kind: 'enum', nameGroup: 1 },
        { regex: /const\s+(\w+)\s*=\s*union/g, kind: 'type', nameGroup: 1 },
      ];

    case 'gdscript':
      return [
        { regex: /func\s+(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /class_name\s+(\w+)/g, kind: 'class', nameGroup: 1 },
        { regex: /(?:@export\s+)?var\s+(\w+)/g, kind: 'variable', nameGroup: 1 },
        { regex: /signal\s+(\w+)/g, kind: 'property', nameGroup: 1 },
      ];

    default:
      return [
        { regex: /function\s+(\w+)/g, kind: 'function', nameGroup: 1 },
        { regex: /class\s+(\w+)/g, kind: 'class', nameGroup: 1 },
      ];
  }
}
