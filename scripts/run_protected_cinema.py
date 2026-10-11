#!/usr/bin/env python3
"""One-time validation workflow leaf; marker/context never authorizes provider spend."""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'image_asset_generator'))
import cinema_provider as cinema
import paid_request_guard as guard

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--authorization', required=True)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--size', required=True)
    parser.add_argument('--seconds', required=True)
    parser.add_argument('--output-root', required=True)
    parser.add_argument('--output-name', required=True)
    args = parser.parse_args()
    if Path(args.output_name).name != args.output_name or not args.output_name.endswith('.mp4'):
        raise guard.PaidRequestUnauthorized('invalid cinema output identity')
    marker = json.loads(Path(args.authorization).read_bytes(), object_pairs_hook=guard.unique_object)
    key = os.environ.get('OPENAI_API_KEY', '').strip()
    if not key:
        raise guard.PaidRequestUnauthorized('provider account credential unavailable')
    program = {'program': 'finite-time-validation', 'model': args.model, 'size': args.size, 'seconds': args.seconds, 'prompt': args.prompt}
    cinema.bind_sources(program, marker)
    output = Path(args.output_root); output.mkdir(parents=True, exist_ok=True)
    created = cinema.create_video(key, args.model, args.size, args.seconds, args.prompt)
    (output / 'create.json').write_text(json.dumps(created, sort_keys=True) + '\n')
    (output / 'video-id.txt').write_text(created['id'])
    completed = cinema.wait_video(key, created['id'], 900)
    (output / 'status.json').write_text(json.dumps(completed, sort_keys=True) + '\n')
    cinema.download_video(key, created['id'], output / args.output_name)
    (output / 'spend-observation.json').write_text(json.dumps({'budgetAttemptId': completed['budget_attempt_id'], 'budgetJobId': completed['budget_job_id'], 'chargesReconciled': False, 'actualSpendUsd': None, 'providerCreateCallsExecuted': 1}, sort_keys=True) + '\n')

if __name__ == '__main__': main()
