# ZCL Thesis browser miner

This repository implements an experimental **WebGPU Equihash 192,7 solver**
for Zclassic's `ZcashPoW` personalization. It performs the actual Blake2b and
collision search on the visitor's GPU. The bilingual interface starts only after
the visitor supplies a public ZCL address or explicitly accepts a donation,
chooses a duration, acknowledges
GPU/electricity use, and presses Start. Hiding the tab or pressing Stop terminates
the worker. No private key or deposit is required.

Both languages offer **Until I stop (no time limit)** alongside 5, 15, 30 and
60-minute sessions. Five minutes remains the default. The explicit `unlimited`
choice creates no worker deadline timer; finite sessions still enforce their
deadline even if a timer is delayed. Keep the tab visible and device awake.
Stop, a hidden/closed tab, pool disconnection, or GPU failure ends mining, and
an ended session never restarts automatically.

The English and Spanish address forms link to the self-contained offline wallet
download at `https://zclthesis.com/offline-wallet.html` and the matching language's
`#wallet` setup guide. The help explains saving the page, disconnecting before
generating a key, backing up the private key, and returning with only the public
address. The mining page does not generate or receive private keys.

An empty or whitespace-only payout field displays **DONATE TO POOL** in both
languages, shows the owner-approved public recipient
`t1Q8PRCDso9HoK36XeLCPym6vZmkwyNgS4d`, and explains that the visitor receives no
mining payouts. A separate unchecked acknowledgment is required before Start can
use this destination. The ordinary 0.8% fee and 0.05 ZCL payout threshold still
apply. Entered payout addresses always take precedence; malformed entered
addresses never fall back to donations. Editing the address clears both consent
checkboxes. Ending a donation session clears its acknowledgment, so a restart
requires a fresh choice. No editing, status refresh, or checkbox action starts
GPU work. The bridge still validates every destination's ZCL address checksum.

The interface connects through a restricted WebSocket bridge to our fixed local
Stratum server. It does not expose node RPC or accept arbitrary proxy targets.
The solver core itself has no network connection or payout destination.

**Launch status:** public mining opened on September 12, 2026. Check the
[live pool status](https://pool.zclthesis.com/) before starting. The final
two-minute Mac GPU test received 7 accepted shares and zero rejects across three
jobs, with accepted work credited to the intended payout account. No mainnet
block or payment occurred in the launch tests; see the
[deployment record](https://github.com/netzo92/zclthesis-pool/blob/dev/docs/GCP-OPERATIONS.md#final-repaired-deployment-and-public-reopening).

## Live reward dashboard

`/mine/#earnings-dashboard` (and `/mine/es/#earnings-dashboard`) reads the
selected public address from the existing payout field. Native miners can enter
an address and inspect it without starting browser mining. The default blank
field shows the approved pool donation address with an explicit no-payouts-to-you
notice: its totals aggregate all donors and are never presented as this
visitor’s personal earnings. Address changes discard the previous address’s
figures and observations. Session work remains attributed to its original
recipient until a new browser session begins.

The read-only `/api/miner.json?address=...` response supplies retained credited
rewards, immature rewards, mature rewards awaiting credit, paid amounts, and
mature unreserved balance. Progress toward the 0.05 ZCL threshold uses only that
available balance; already-reserved payouts appear separately. Reaching the
threshold does not promise an immediate payment. Miner rewards are net of the
pool fee; the pool’s recorded, last-day, and last-hour block totals are gross.
Hashrate and network percentages are explicitly estimates from accepted work
over five minutes (with a separate one-hour estimate) and a network observation
over the last 120 blocks. Stale network observations cannot supply percentages.

The SVG chart switches between timestamped credited-reward observations, the
existing browser’s actual accepted-share counter, and a separately labeled
conditional next-block allocation. It retains at most 180 points
from the last 90 minutes in memory, inserts no historical earnings, and breaks
lines across observation gaps longer than 90 seconds. A single initial point
is identified as such; zero rewards remain zero. A keyboard-accessible slider
and exact-value table accompany the chart. An accepted-share pulse respects
`prefers-reduced-motion`. Counter resets begin a new session series.

Ledger polling runs every 30 seconds while visible. HTTPS Date compensates for
device-clock skew. Failed refreshes retain timestamped previous observations;
unavailable data renders dashes, while a successfully checked unseen address
has an explicit no-recorded-activity label. Validation checks address binding,
exact zatoshi amounts, reward conservation, available-balance progress, work
ratios, and source freshness. The dashboard has no mining-control hooks: the
existing consent, donation acknowledgment, Start, Stop, and hidden-tab behavior
remain in `app.mjs`.

### Conditional next-block allocation

The amber summary and third chart mode show **Estimated allocation if the pool
finds the next block**, based on the backend’s exact allocator, current retained
unconsumed round work, and the subsidy at the next height. Transaction fees are
excluded; the pool fee and any additional account donation are deducted. This is
a conditional scenario, never credited rewards, available balance, or payout
progress. The estimate can rise or fall as other miners submit work. A blank
address uses the explicitly disclosed shared treasury destination and includes
all donors, owner activity, and native miners using that address.

The estimate requires a fresh complete ledger, matching address, verified tip,
nonempty round, and no accounting hold. Empty rounds, partial data, stale subsidy
observations, malformed values, and refresh failures suppress the amount and
conditional chart. A verified zero-work address in a nonempty round can show
zero. Exact amount conservation and the allocator’s possible one-zatoshi
largest-remainder adjustment are checked in `earnings-data.mjs`.

Only received observations become chart points; nothing interpolates money or
backfills earlier history. Changing address or pool allocation round resets the
series. A genuine new observation with a changed allocation can briefly highlight
the estimate, including a decrease; reduced-motion preferences disable the pulse.
Automatic chart selection falls back to actual credited history or accepted work
when an estimate is unavailable. An explicit chart choice stays selected with
its status explanation. The exact-value table and keyboard slider remain usable
in all three modes. Mining controls and consent behavior are unchanged.

The conditional-allocation change passed all 50 Node tests. Isolated fixture
browser checks passed English and Spanish at 320 and 1,440 pixels, including all
three modes, exact-value inspection, balance/progress separation, round/address
resets, verified zero, partial/held/stale/failure suppression, automatic fallback,
and receipt of changes after the 180-observation cap. Reduced motion and unchanged
unchecked consents were verified. The browser had all traffic intercepted and
mining workers/connections blocked; no live mining or shared-browser interaction
occurred. The actual PHP backend’s
synthetic `round-projection.php --fixture` output also passed both frontend
validators and both language renderers unchanged. These fixtures validate the
UI and contract compatibility, not live allocation accuracy.

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
connection, per-peer, rate, and queue limits. Healthy authorized connections have
no fixed lifetime; heartbeat, initial-address, authorization and upstream-idle timeouts still
remove disconnected or inactive clients. It never handles payouts;
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
The English and Spanish Start controls apply the same freshness bounds before
allowing a visitor to begin a session.

## Local performance display

The English and Spanish session pages report **local verified proofs per second**
separately from the pool API's five-minute difficulty-weighted accepted-work
estimate. The local numerator is the solver's deduplicated, host-verified
Equihash proofs before the pool share-target check. Completed nonces are not
counted as solutions: one nonce may return zero, one, or several proofs.

The denominator is monotonic elapsed time from the first solve through the latest
completed solve. It includes canceled work and time between solves, and excludes
connection and GPU/shader setup. Updates happen only when a solve completes;
a stopped session retains its last observation. Last completed solve duration and
the measured elapsed time are shown separately. A new session resets the rate;
repeated or out-of-order attempt messages cannot increase the counters.

The last completed solve also reports discarded rows/candidates when the fixed
bucket or candidate capacity is exceeded. Missing overflow telemetry is labeled
unavailable. Such loss can reduce valid proofs recovered; no loss rate or speedup
is inferred without a measurement. This display does not change the solver,
share target, pool/network estimates, payout logic, GPU scheduling, or lifecycle
controls. A hidden tab still stops mining.

The timing and UI tests use virtual clocks and mock workers: canceled-work time,
setup exclusion, zero-proof solves, reset, deduplication, malformed timing,
pre-target proof counts, late events from a stopped worker, and bilingual overflow
messages. All 53 CPU and localhost-mock tests passed for this change. They do not
execute GPU work. The historical finite results below remain the available hardware
evidence, not a sustained-performance benchmark.

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

The English and Spanish miner pages show live block height, connected peers,
network hashrate (not pool hashrate), fee and minimum payout above the form.
Readiness requires matching version-1 ZCL status documents, the configured 0.8%
fee, an accepting pool and a synchronized node. Each uncached status request has
an eight-second timeout and a manual retry. A valid HTTPS response Date provides
the freshness reference when the device clock differs; exports older than three
minutes or over five minutes in the future still keep Start disabled. Without a
server Date the page uses, and explicitly identifies, the device clock. Stale
data, synchronization, maintenance, incompatible settings and request failures
have separate messages. Retrying or returning to the tab never starts mining.

The readiness update passed all 37 automated tests, including simulated device
clock skew, stale exports despite a valid server clock, bad schemas, stalled
requests and retry recovery. A read-only public WebSocket check on September 13,
2026 (UTC) received session, authorization, target and a valid job with zero
submitted shares and no GPU work. This check establishes work delivery, not
mining performance or a payout.

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

- Automated tests cover proof verification, worker stop/restart, malformed
  submissions, launch gates, connection limits and address binding. Virtual-time
  duration tests exercise continued work after the old hour limit and after a
  month, plus finite deadlines, manual Stop, disconnection and hidden-tab cleanup.
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
- The final two-minute live pool test generated 20 valid proofs and received
  7 accepted target-qualified shares with zero rejects across three jobs. The
  production ledger verified their account attribution and the configured fee
  recipient. No mainnet block or payment occurred. These finite runs are not
  sustained speed or profitability benchmarks.

The optional CDP runner only targets the isolated localhost test page. Set
`ZCL_TEST_CDP_URL` to a separate test browser's localhost endpoint. Running the
historical 192,7 test additionally requires `ZCL_HISTORICAL_GPU_TEST=1`; it
recomputes a fixed old header and does not contact the live network.

See [third-party notices](THIRD_PARTY_NOTICES.md) for the MIT-licensed solver
reference and attribution.

The live earnings dashboard was published from `8ec2721` on September 13, 2026,
using the pool's read-only API implementation `0302954`. All 46 Node tests and
58 backend accounting checks passed. Live English/Spanish checks at 390 and
1,440 pixels verified actual ledger values, payout progress, network shares,
both chart tabs, observation selection and the automatic 30-second refresh.
The checks ran in a separate headless browser with mining workers/connections
blocked; neither was attempted. Existing browser sessions were left untouched.
Live assets matched reviewed source and `public/app.mjs` stayed unchanged.

The observed reward/available amounts were zero and the payout threshold was
0.05 ZCL. These were genuine ledger observations, not demonstration balances.
The page builds its chart from readings while open; it does not reconstruct
earlier earnings or retain chart history after the page is closed.


## Accepted-share help and pool block counts

English and Spanish explanations beside the accepted-work chart and session
counter define an accepted share as pool-validated mining work. Its difficulty
contributes to reward allocation for the selected payout address; acceptance
alone does not establish a block or payment. The help opens on hover, keyboard
focus or tap, supports hovering the explanation, and closes with Escape, a
second tap or an outside tap. It does not announce each share or start mining.

The miner dashboard also shows recorded block counts beside total, last-24-hour
and last-hour ZCL rewards, using the existing read-only ledger response and
30-second refresh. Partial positive counts are lower bounds; missing, malformed
or unknown counts use dashes. Stale observations retain their timestamp and
warning. Mature and immature canonical blocks are included in these counts.

All 46 existing Node tests passed. Isolated English/Spanish browser checks at
320 and 1,440 pixels verified tooltip mouse, keyboard and touch interactions,
viewport bounds, block-count pluralization, partial/unavailable/invalid/stale
fixtures, and unchanged unchecked mining consents. GPU workers and mining
connections were blocked and none were attempted. `public/app.mjs` is unchanged.


The tooltip/block-count release `ce5555d` is deployed to the pool VM without
restarting mining services. Live verification on September 13 at 17:54–17:56 UTC
passed both languages at 320 and 1,440 pixels, including hover, keyboard and touch
help. All six checked assets matched source, including the unchanged mining
controller. The live ledger reported zero pool blocks in all three windows.

## September 13 treasury and projection publication

Treasury UI `0c68135` and conditional chart `c806269` are live with pool backend
`7328455` and `894d468`, respectively. The runtime webminer checkout was clean
at `c806269b3ad5d4a94e35ffba2d8f8837f28d29c5`. Deployment did not restart mining
services. Six chart/module assets matched the committed bytes, including the
unchanged mining controller.

The projection passed 920 read-only backend checks, 117 treasury regressions,
58 miner-accounting regressions, all 50 frontend tests and independent review.
The actual backend's synthetic JSON passed both frontend validators and both
language renderers. Live English/Spanish checks at 320 and 1,440 pixels passed
with GPU workers and mining sockets blocked, unchecked consent, no JavaScript
errors and no horizontal overflow.

The live observation at 18:20:39 UTC showed a conditional shared-address
allocation of 0.3875 ZCL from a 0.390625 ZCL next-block subsidy, after the 0.8%
pool fee. Credited rewards, available balance and confirmed treasury receipts
were all zero, and no pool blocks were recorded. The browser displayed the
same separation. This conditional amount is a dated scenario, not earned ZCL
or a prediction of when a block will arrive.
