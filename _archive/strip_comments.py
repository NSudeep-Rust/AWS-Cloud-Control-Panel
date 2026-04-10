"""
strip_comments.py — CloudShield Comment Stripper

Removes PURE comment lines from .py, .js, .jsx files in app/.
A 'pure comment line' = a line containing ONLY a comment (no real code).
Inline comments (code + # comment) are left untouched.

Usage:
    python strip_comments.py          -- dry-run (safe preview, no changes)
    python strip_comments.py --apply  -- actually strip + create .bak backups
"""

import sys
import shutil
from pathlib import Path
from datetime import datetime

# ── Dirs to skip ─────────────────────────────────────────────────────────────
SKIP_DIRS = {
    'venv', '.venv', 'node_modules', '__pycache__',
    '.git', 'dist', 'build', 'backup-final',
    'backup-final-before-critical', '.bak',
}

PROJECT_ROOT = Path(__file__).parent
APP_DIR      = PROJECT_ROOT / 'app'


# ── Per-language comment detectors ───────────────────────────────────────────

def _is_pure_comment_py(line: str, line_no: int) -> bool:
    stripped = line.strip()
    if not stripped:
        return False                         # blank line — keep
    if not stripped.startswith('#'):
        return False                         # not a comment at all
    if line_no == 1 and stripped.startswith('#!'):
        return False                         # shebang line — keep
    if line_no <= 2 and '-*-' in stripped:
        return False                         # coding declaration — keep
    return True


def _is_pure_comment_js(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if stripped.startswith('//'):
        return True                          # // single-line comment
    return False


# ── Core file processor ───────────────────────────────────────────────────────

def process_file(path: Path, dry_run: bool) -> tuple[int, int, list[str]]:
    """
    Returns (original_line_count, lines_removed, preview_lines).
    preview_lines holds up to 10 example removed lines for the report.
    """
    ext = path.suffix.lower()

    if ext == '.py':
        checker = _is_pure_comment_py
        use_lineno = True
    elif ext in ('.js', '.jsx'):
        checker = _is_pure_comment_js
        use_lineno = False
    else:
        return 0, 0, []

    try:
        text = path.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        print(f"  [SKIP] Cannot read {path}: {e}")
        return 0, 0, []

    lines    = text.splitlines(keepends=True)
    kept     = []
    removed  = 0
    previews = []

    for i, line in enumerate(lines):
        is_comment = (
            checker(line, i + 1) if use_lineno else checker(line)
        )
        if is_comment:
            removed += 1
            if len(previews) < 8:
                previews.append(line.rstrip())
        else:
            kept.append(line)

    if not dry_run and removed > 0:
        # Backup alongside the original
        backup = path.with_suffix(path.suffix + '.bak')
        shutil.copy2(path, backup)
        # Write cleaned file
        path.write_text(''.join(kept), encoding='utf-8')

    return len(lines), removed, previews


# ── Directory walker ──────────────────────────────────────────────────────────

def walk(root: Path, dry_run: bool) -> list[tuple[Path, int, int, list]]:
    results = []
    for path in sorted(root.rglob('*')):
        # Skip unwanted directories
        if any(skip in path.parts for skip in SKIP_DIRS):
            continue
        if path.suffix.lower() not in ('.py', '.js', '.jsx'):
            continue
        if not path.is_file():
            continue

        orig, removed, previews = process_file(path, dry_run)
        if removed > 0:
            results.append((path, orig, removed, previews))
    return results


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    dry_run = '--apply' not in sys.argv
    mode_label = 'DRY RUN — No files changed' if dry_run else '⚠️  APPLYING — Writing files + creating .bak backups'

    print(f"\n{'='*65}")
    print(f"  CloudShield Comment Stripper")
    print(f"{'='*65}")
    print(f"  Target : {APP_DIR}")
    print(f"  Mode   : {mode_label}")
    print(f"  Time   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*65}\n")

    results = walk(APP_DIR, dry_run)

    total_files   = len(results)
    total_removed = sum(r for _, _, r, _ in results)

    if not results:
        print("  ✅ No pure comment lines found — codebase is already clean!\n")
    else:
        for path, orig, removed, previews in results:
            rel = path.relative_to(PROJECT_ROOT)
            print(f"  {str(rel):<65}  -{removed:>4} lines  ({orig} total)")
            if previews and dry_run:
                for p in previews:
                    # Truncate long lines for readability
                    display = p[:80] + '…' if len(p) > 80 else p
                    print(f"       \033[90m{display}\033[0m")
                print()

    print(f"\n{'='*65}")
    print(f"  Files affected : {total_files}")
    print(f"  Lines to strip : {total_removed}")
    if dry_run:
        print(f"\n  ✅ This was a DRY RUN — nothing was changed.")
        print(f"  Run with --apply to actually strip and create backups.")
    else:
        print(f"\n  ✅ Done! Each changed file has a .bak backup alongside it.")
        print(f"  To restore: rename filename.py.bak → filename.py")
    print(f"{'='*65}\n")


if __name__ == '__main__':
    main()
