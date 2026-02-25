"""Quick syntax checker for all Python files."""
import ast, os, sys

errors = []
count = 0
for root, dirs, files in os.walk('.'):
    # Skip corpus directories
    if 'NANO_corpus' in root or 'ML_CODE' in root:
        continue
    for f in files:
        if f.endswith('.py'):
            path = os.path.join(root, f)
            count += 1
            try:
                with open(path, encoding='utf-8') as fh:
                    ast.parse(fh.read())
            except SyntaxError as e:
                errors.append(f'{path}: line {e.lineno}: {e.msg}')

if errors:
    print('SYNTAX ERRORS:')
    for e in errors:
        print(f'  {e}')
    sys.exit(1)
else:
    print(f'All {count} Python files pass syntax check')
