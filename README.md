# ZCL browser solver core

This repository implements an experimental **WebGPU Equihash 192,7 solver**
for Zclassic's `ZcashPoW` personalization. It performs the actual Blake2b and
collision search on the visitor's GPU. It has no pool connection, wallet key,
automatic startup, or payout destination of its own.

```js
import {createSolver, preferredLimits} from './src/solver.mjs';

// Call only after the visitor chooses to start.
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('WebGPU unavailable');
const device = await adapter.requestDevice({requiredLimits: preferredLimits(adapter.limits)});
const solver = await createSolver(device);
const controller = new AbortController();
const proofs = await solver.solve(header140, {
  signal: controller.signal,
  onProgress: progress => console.log(progress),
});
// Each proof is a 400-byte Uint8Array, without the CompactSize prefix.
// A Zcash Stratum bridge prepends fd9001 when serializing mining.submit.
solver.dispose();
device.destroy();
```

The caller supplies a complete 140-byte header including the nonce. A call
searches that fixed header once. The worker that manages jobs must allocate
distinct nonces, cancel stale jobs, and account for the pool's extranonce.
Abort is checked between bounded GPU dispatches; it does not interrupt a
dispatch already executing. Wait for `solve()` to settle before `dispose()`.

`estimateRequirements(device.limits)` reports the actual allocation. The
192,7 arenas require approximately **3.26 GiB**, including counters. They are
partitioned into device-sized buffers and processed in output groups that fit
the adapter's storage-binding limit. Insufficient memory/limits fail explicitly.
Smaller chunks repeat work across groups and can be considerably slower.

Buckets have a fixed capacity of 64 rows. Overflow rows and excess candidates
are reported through `onProgress`; discarded rows can lose solutions. Candidate
trees with duplicate indices or invalid collision structure are never returned.
All returned solutions pass the host verifier. This implementation does not
promise to recover every possible solution or match native miner performance.

The reduced 96,5 configuration exists for finite correctness tests and is never
used as a fallback for Zclassic mining. No reduced-parameter proof is suitable
for ZCL 192,7.

## Validation

```sh
npm test
python3 tests/verify-proof.py tests/zcl-mainnet-header.json
python3 -m http.server 8766 --bind 127.0.0.1
# Open http://127.0.0.1:8766/tests/gpu.html and choose a finite test.
```

The test page is idle until a button is pressed. Fixed Blake2b vectors were
generated independently with Python's hashlib. The mainnet fixture is block
3192878, supplied by Zclassic v2.1.2-beta6 RPC; the tests check both its block
hash and existing 192,7 proof. An independent Python verifier can also validate
GPU-generated test results saved by `tests/run-browser-test.mjs`.

Validation so far on Chrome / Apple Metal 3:

- Host tests: 11 passed, including the mainnet fixture and mutation rejection.
- All six GPU Blake2b vectors passed.
- A real 96,5 proof was generated and independently accepted by Python hashlib.
- Forced 64 KiB storage chunking generated another independently valid 96,5 proof.
- Full 192,7 historical-header recomputation returned three independently valid
  proofs, including the original mainnet proof, in a single 5.76-second run.
- Aborting a GPU run and restarting the same solver passed a bounded 96,5 test.
- End-to-end acceptance through the live pool remains untested. The timing above
  is one correctness run, not a sustained speed or profitability benchmark.

The optional CDP runner only targets the isolated localhost test page. Set
`ZCL_TEST_CDP_URL` to a separate test browser's localhost endpoint. Running the
historical 192,7 test additionally requires `ZCL_HISTORICAL_GPU_TEST=1`; it
recomputes a fixed old header and does not contact the live network.

See [third-party notices](THIRD_PARTY_NOTICES.md) for the MIT-licensed solver
reference and attribution.
