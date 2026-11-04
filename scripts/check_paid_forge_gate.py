#!/usr/bin/env python3
"""Exercise actual protected image executor with synthetic transports and zero provider calls."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    result = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', str(ROOT / 'image_asset_generator/tests'), '-p', 'test_*.py', '-v'], cwd=ROOT)
    if result.returncode == 0:
        print('paid forge gate checks passed; real providerCallsExecuted=0; synthetic fixtures cannot authorize a real job')
    return result.returncode

if __name__ == '__main__':
    raise SystemExit(main())
