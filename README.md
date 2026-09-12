# ZCL Thesis browser miner

This repository implements an experimental **WebGPU Equihash 192,7 solver**
for Zclassic's `ZcashPoW` personalization. It performs the actual Blake2b and
collision search on the visitor's GPU. The bilingual interface starts only after
the visitor supplies a public ZCL address, chooses a time limit, acknowledges
GPU/electricity use, and presses Start. Hiding the tab or pressing Stop terminates
the worker. No private key or deposit is required.

The interface connects through a restricted WebSocket bridge to our fixed local
Stratum server. It does not expose node RPC or accept arbitrary proxy targets.
The solver core itself has no network connection or payout destination.

**Launch status:** implementation and correctness testing are in progress.
Historical GPU proof generation and isolated transport tests have passed;
this document does not yet claim accepted live pool shares or mainnet payouts.

## Pool transport and deployment

```sh
npm ci --ignore-scripts
npm test
node scripts/preview.mjs   # Static localhost preview, no mining auto-start
# The production bridge is installed on the CPU-only pool host:
npm run bridge
```

Serve `public/` at `/mine/` and allowlisted modules from `src/` at `/mine/src/`.
The website origin is `https://pool.zclthesis.com`; Caddy terminates TLS and
proxies `/ws` to `127.0.0.1:8787`. The supplied systemd service runs as the
unprivileged `zclpool` user. See the pool repository's `deploy/zcl/Caddyfile`.
Caddy must replace the forwarded client address using
`header_up X-Forwarded-For {http.request.remote.host}`. The loopback bridge
accepts a single IP address, rejects forwarded chains, and includes pending
handshakes in its connection limits.

The bridge connects only to `127.0.0.1:2192`. It validates the address checksum,
subscribes and authorizes that address, and accepts only bounded canonical
400-byte solutions for recent jobs from that connection. It applies frame,
connection, per-peer, rate, queue, and session limits. It never handles payouts;
the separate pool ledger allocates 99.2% of round rewards to participating miners
and 0.8% to the operator, with a 0.05 ZCL miner payout threshold.

Admission requires a fresh synced `/var/lib/zcl-public/api/node.json` and a
fresh `/var/lib/zcl-public/api/pool.json` with `acceptingMiners: true` and
`feePercent: 0.8`. Both files need a valid `generatedAt` timestamp no older than
three minutes and no more than five minutes in the future. Missing or stale
observations fail closed, including for private tests. A private
`ZCL_TEST_PAYOUT_ADDRESS` deployment setting permits only the explicitly named
public address to test a synced pool before general admission; never commit
operator configuration. Tests may override the status paths and ports to use
isolated mock services. They do not mine or send money.

## Solver API

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

- Automated tests: 27 passed, including proof verification, worker stop/restart,
  malformed submissions, launch gates, connection limits and address binding.
- All six GPU Blake2b vectors passed.
- A real 96,5 proof was generated and independently accepted by Python hashlib.
- Forced 64 KiB storage chunking generated another independently valid 96,5 proof.
- Full 192,7 historical-header recomputation returned three independently valid
  proofs, including the original mainnet proof, in a single 5.76-second run.
- Aborting a GPU run and restarting the same solver passed a bounded 96,5 test.
- The pool's production C++/libsodium verifier accepted all three historical
  WebGPU proofs on Ubuntu with ASan/UBSan, and rejected nine mutations. The
  [native regression](https://github.com/netzo92/zclthesis-pool/tree/97e5490/stratum/tests/fixtures)
  records the fixture and reproducible command.
- End-to-end acceptance through the live pool remains untested. The timing above
  is one correctness run, not a sustained speed or profitability benchmark.

The optional CDP runner only targets the isolated localhost test page. Set
`ZCL_TEST_CDP_URL` to a separate test browser's localhost endpoint. Running the
historical 192,7 test additionally requires `ZCL_HISTORICAL_GPU_TEST=1`; it
recomputes a fixed old header and does not contact the live network.

See [third-party notices](THIRD_PARTY_NOTICES.md) for the MIT-licensed solver
reference and attribution.
