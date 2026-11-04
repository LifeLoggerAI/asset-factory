#!/usr/bin/env python3
"""Training-only equal camera-pair coverage allocator. Never reads heldout views."""
import numpy as np

def select_pair_indices(valid, pair_number, n_training_pairs, budget=1600):
    if not isinstance(pair_number,int) or not 0<=pair_number<n_training_pairs or n_training_pairs<2:
        raise ValueError('TRAIN_PAIR_ID_INVALID')
    if budget<n_training_pairs:
        raise ValueError('CANDIDATE_BUDGET_INSUFFICIENT_FOR_PAIR_COVERAGE')
    ids=np.flatnonzero(np.asarray(valid,dtype=bool))
    if len(ids)==0:return np.empty(0,dtype=int)
    base,rem=divmod(budget,n_training_pairs)
    quota=base+(1 if pair_number<rem else 0)
    if len(ids)<=quota:return ids
    # Deterministically distribute across source keypoints, not heldout quality.
    return ids[np.unique(np.linspace(0,len(ids)-1,quota,dtype=int))]

if __name__=='__main__':
    for p in range(16):
        v=select_pair_indices(np.ones(420,dtype=bool),p,16)
        assert len(v)==100 and v[0]==0 and v[-1]==419
    try:select_pair_indices([True],0,16,4)
    except ValueError: pass
    else:raise AssertionError('inadequate budget accepted')
    print('PASS balanced training-only coverage: 16 pairs at 100 candidates, no later pair starved')
