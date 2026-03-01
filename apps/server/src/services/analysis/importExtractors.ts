// ============================================
// Import Extractors — per-language import/require
// statement parsing for dependency analysis
// Extracted from relationshipIndex.ts for modularity
// ============================================
import { basename, extname } from 'path';

export interface ImportInfo {
  modulePath: string;
  importedNames: string[];
  isWildcard: boolean;
  isDefault: boolean;
  line: number;
}

export function extractImports(code: string, language: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  switch (language) {
    case 'typescript':
    case 'javascript': {
      const namedImport = /import\s+\{([^}]+)\}\s+from\s+['"](.+?)['"]/g;
      const defaultImport = /import\s+(\w+)\s+from\s+['"](.+?)['"]/g;
      const wildcardImport = /import\s+\*\s+as\s+(\w+)\s+from\s+['"](.+?)['"]/g;
      const requireImport = /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"](.+?)['"]\s*\)/g;
      const reExport = /export\s+\{([^}]*)\}\s+from\s+['"](.+?)['"]/g;

      let m;
      while ((m = namedImport.exec(code)) !== null) {
        imports.push({
          modulePath: m[2],
          importedNames: m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
          isWildcard: false, isDefault: false,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      while ((m = defaultImport.exec(code)) !== null) {
        if (!m[0].includes('{') && !m[0].includes('*')) {
          imports.push({
            modulePath: m[2], importedNames: [m[1]],
            isWildcard: false, isDefault: true,
            line: code.substring(0, m.index).split('\n').length,
          });
        }
      }
      while ((m = wildcardImport.exec(code)) !== null) {
        imports.push({
          modulePath: m[2], importedNames: [m[1]],
          isWildcard: true, isDefault: false,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      while ((m = requireImport.exec(code)) !== null) {
        const names = m[1] ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [m[2]];
        imports.push({
          modulePath: m[3], importedNames: names,
          isWildcard: false, isDefault: !m[1],
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      while ((m = reExport.exec(code)) !== null) {
        imports.push({
          modulePath: m[2],
          importedNames: m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
          isWildcard: false, isDefault: false,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      break;
    }

    case 'python': {
      const fromImport = /^from\s+([\w.]+)\s+import\s+(.+)$/gm;
      const directImport = /^import\s+([\w.,\s]+)$/gm;
      let m;
      while ((m = fromImport.exec(code)) !== null) {
        const names = m[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        imports.push({
          modulePath: m[1], importedNames: names,
          isWildcard: names.includes('*'), isDefault: false,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      while ((m = directImport.exec(code)) !== null) {
        const modules = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        for (const mod of modules) {
          imports.push({
            modulePath: mod, importedNames: [mod.split('.').pop()!],
            isWildcard: false, isDefault: true,
            line: code.substring(0, m.index).split('\n').length,
          });
        }
      }
      break;
    }

    case 'rust': {
      const useImport = /use\s+([\w:]+)(?:::(\{[^}]+\}|\w+|\*))?/g;
      let m;
      while ((m = useImport.exec(code)) !== null) {
        const path = m[1];
        let names: string[] = [];
        if (m[2]) {
          if (m[2] === '*') {
            names = ['*'];
          } else if (m[2].startsWith('{')) {
            names = m[2].slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
          } else {
            names = [m[2]];
          }
        } else {
          names = [path.split('::').pop()!];
        }
        imports.push({
          modulePath: path, importedNames: names,
          isWildcard: names.includes('*'), isDefault: false,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      break;
    }

    case 'go': {
      const singleImport = /^import\s+"(.+?)"/gm;
      const blockImport = /import\s+\(([\s\S]*?)\)/g;
      let m;
      while ((m = singleImport.exec(code)) !== null) {
        imports.push({
          modulePath: m[1], importedNames: [m[1].split('/').pop()!],
          isWildcard: false, isDefault: true,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      while ((m = blockImport.exec(code)) !== null) {
        for (const line of m[1].split('\n')) {
          const imp = line.match(/(?:(\w+)\s+)?"(.+?)"/);
          if (imp) {
            imports.push({
              modulePath: imp[2], importedNames: [imp[1] || imp[2].split('/').pop()!],
              isWildcard: false, isDefault: true,
              line: code.substring(0, m.index).split('\n').length,
            });
          }
        }
      }
      break;
    }

    case 'java':
    case 'kotlin': {
      const javaImport = /^import\s+(?:static\s+)?([\w.]+)(?:\.\*)?;?\s*$/gm;
      let m;
      while ((m = javaImport.exec(code)) !== null) {
        const isWild = m[0].includes('.*');
        imports.push({
          modulePath: m[1], importedNames: [m[1].split('.').pop()!],
          isWildcard: isWild, isDefault: false,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      break;
    }

    case 'csharp': {
      const usingImport = /^using\s+(?:static\s+)?([\w.]+);/gm;
      let m;
      while ((m = usingImport.exec(code)) !== null) {
        imports.push({
          modulePath: m[1], importedNames: [m[1].split('.').pop()!],
          isWildcard: false, isDefault: true,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      break;
    }

    case 'php': {
      const phpUse = /use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/g;
      const phpInclude = /(?:require|include)(?:_once)?\s+['"](.+?)['"]/g;
      let m;
      while ((m = phpUse.exec(code)) !== null) {
        imports.push({
          modulePath: m[1], importedNames: [m[2] || m[1].split('\\').pop()!],
          isWildcard: false, isDefault: false,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      while ((m = phpInclude.exec(code)) !== null) {
        imports.push({
          modulePath: m[1], importedNames: [basename(m[1], extname(m[1]))],
          isWildcard: false, isDefault: true,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      break;
    }

    case 'dart': {
      const dartImport = /import\s+['"](.+?)['"](?:\s+as\s+(\w+))?/g;
      let m;
      while ((m = dartImport.exec(code)) !== null) {
        imports.push({
          modulePath: m[1], importedNames: [m[2] || basename(m[1], '.dart')],
          isWildcard: false, isDefault: true,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
      break;
    }

    default: {
      const generic = /(?:import|require|include|use)\s+['"]?([^\s'";\n]+)/g;
      let m;
      while ((m = generic.exec(code)) !== null) {
        imports.push({
          modulePath: m[1], importedNames: [m[1].split(/[/\\.]/).pop()!],
          isWildcard: false, isDefault: true,
          line: code.substring(0, m.index).split('\n').length,
        });
      }
    }
  }

  return imports;
}
