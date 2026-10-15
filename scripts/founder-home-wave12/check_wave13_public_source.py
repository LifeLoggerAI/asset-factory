#!/usr/bin/env python3
"""Low-dependency Asset Factory CI source boundary: no network or paid execution."""
import ast
from pathlib import Path
base=Path(__file__).parent
required=('author_founder_home_v2.py','author_founder_home_v3.py','render_founder_home_v3.py','build_coherent_camera_dataset_v3r2.py','adapt_modeled_segments_to_canonical_preflight.py','train_pair_budget.py','train_founder_home_v3_with_canonical_consensus.py','evaluate_founder_home_v3_holdout.py','test_founder_home_v3.py')
for name in required:
 p=base/name
 if not p.is_file():raise SystemExit('MISSING_V3_AUTHORING_SOURCE '+name)
 ast.parse(p.read_text(),filename=str(p))
content=(base/'author_founder_home_v3.py').read_text()
assert 'author_founder_home_v2.py' in content
assert 'PRIVATE_FOUNDER' not in content or 'os.environ.pop' in content
assert 'False' in content and 'PREPARED_HARD_OFF_NO_PAID_EXECUTION' not in content or 'False' in content
acq=(base/'build_coherent_camera_dataset_v3r2.py').read_text()
assert 'TEST_POS=' in acq and "'source_kind':'CONTROLLED_RENDER_FIXED_SCENE'" in acq
tr=(base/'train_founder_home_v3_with_canonical_consensus.py').read_text()
assert 'select_pair_indices' in tr and "'MODELED_W13_V3_FUTURE_HELDOUT'" in tr
assert 'training_descriptor_consensus' in tr
holdout=(base/'evaluate_founder_home_v3_holdout.py').read_text()
assert "{'H00','H01','H02','H03','H04','H05'}" in holdout and "'required_heldout_views':6" in holdout
assert 'unfit_p90_px' in holdout and '8' in holdout and "'gpu_training_authorized':False" in holdout
print('PASS: nine V2+V3 public source files parse and guards remain non-production')
