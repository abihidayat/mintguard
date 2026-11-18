#!/usr/bin/env node
// MintGuard checker — the same battery the MintGuard site runs in the browser.
// Usage: node scripts/check.mjs <contractAddress> [checkerWallet] [agentName]
// Read-only: eth_call / eth_getCode / Sourcify. Nothing is ever sent.
import { createHash } from 'node:crypto';
import { keccak256 } from 'js-sha3';

const RPCS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.binance.org',
  'https://bsc.publicnode.com',
];
const REGISTRY = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const DEFAULT_WALLET = '0xDCd5269233043B2383070f5314103CD165EEda73'; // an Agent ID holder wallet, simulation sender
const DEFAULT_NAME = 'pulupulu';

const sel = (sig) => '0x' + keccak256(sig).slice(0, 8);
const SELECTORS = Object.fromEntries(
  ['totalSupply()', 'freeMinted()', 'balanceOf(address)', 'mint()', 'mint(uint256)',
   'freeMint()', 'freeMint(uint256)', 'name()', 'symbol()', 'owner()',
   'totalMinted()', 'maxSupply()', 'MAX_SUPPLY()'].map((s) => [s, sel(s)]),
);

async function rpc(method, params) {
  let lastErr;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const padAddr = (a) => a.toLowerCase().replace('0x', '').padStart(64, '0');
const call = (to, data, from) =>
  rpc('eth_call', [{ to, data, ...(from ? { from } : {}) }, 'latest']).catch((e) => ({ __error: e.message }));

function asInt(v) {
  if (typeof v !== 'string' || !v.startsWith('0x') || v === '0x') return null;
  try { return BigInt(v); } catch { return null; }
}
function asString(v) {
  if (typeof v !== 'string' || !v.startsWith('0x')) return null;
  try {
    const hex = v.slice(2);
    const len = parseInt(hex.slice(64, 128), 16);
    return Buffer.from(hex.slice(128, 128 + len * 2), 'hex').toString('utf8');
  } catch { return null; }
}

async function sourcify(address) {
  try {
    const r = await fetch(`https://sourcify.dev/server/v2/contract/56/${address}?fields=abi`, { headers: { accept: 'application/json' } });
    if (!r.ok) return { status: 'unknown', abi: [] };
    const j = await r.json();
    return { status: j.match || 'none', verified: j.match === 'exact_match' || j.match === 'match', abi: j.abi || [] };
  } catch { return { status: 'unknown', abi: [] }; }
}

// ---- minimal ABI encoding for probe arguments ----
const encUint = (n) => BigInt(n).toString(16).padStart(64, '0');
const encAddr = (a) => padAddr(a);
const encBool = (b) => (b ? '1' : '0').padStart(64, '0');
function encArgs(types, values) {
  // supports static (uint/address/bool/bytes32) + one dynamic (string) anywhere
  let head = '';
  let tail = '';
  const headBytes = types.length * 32;
  types.forEach((t, i) => {
    const v = values[i];
    if (t === 'string') {
      const bytes = Buffer.from(String(v), 'utf8');
      head += encUint(headBytes + tail.length / 2);
      tail += encUint(bytes.length) + bytes.toString('hex').padEnd(Math.ceil(bytes.length / 32) * 64, '0');
    } else if (t.startsWith('uint') || t.startsWith('int')) head += encUint(v);
    else if (t === 'address') head += encAddr(v);
    else if (t === 'bool') head += encBool(v);
    else if (t === 'bytes32') head += String(v).replace('0x', '').padStart(64, '0');
    else throw new Error('unsupported probe type ' + t);
  });
  return head + tail;
}

function probeArgSets(types, wallet, agentName) {
  const U = (n) => n;
  const combos = [];
  const key = types.join(',');
  const one = (arr) => combos.push(arr);
  if (types.length === 0) one([]);
  else if (key === 'uint256' || key === 'uint8') one([U(1)]);
  else if (key === 'uint256,uint256') { one([1, 1]); one([0, 1]); one([1, 0]); }
  else if (key === 'string') one([agentName]);
  else if (key === 'string,uint256') one([agentName, 1]);
  else if (key === 'uint256,string') one([1, agentName]);
  else if (key === 'address') one([wallet]);
  else if (key === 'address,uint256') one([wallet, 1]);
  else if (key === 'uint256,address') one([1, wallet]);
  else if (key === 'address,address') one([wallet, '0x0000000000000000000000000000000000000000']);
  else if (key === 'uint256,address,address') one([1, wallet, '0x0000000000000000000000000000000000000000']);
  return combos;
}

export async function checkContract(address, wallet = DEFAULT_WALLET, agentName = DEFAULT_NAME) {
  const out = { address, wallet, checks: {}, verdict: null };
  const c = out.checks;

  const code = await rpc('eth_getCode', [address, 'latest']).catch(() => '0x');
  c.hasCode = code && code !== '0x';
  if (!c.hasCode) { out.verdict = 'NO CONTRACT — no code at this address on BNB Chain.'; return out; }

  c.name = asString(await call(address, SELECTORS['name()'])) ?? undefined;
  c.symbol = asString(await call(address, SELECTORS['symbol()'])) ?? undefined;

  const src = await sourcify(address);
  c.sourceVerified = src.verified === true;
  c.sourcifyMatch = src.status;

  const bal = asInt(await call(REGISTRY, SELECTORS['balanceOf(address)'] + padAddr(wallet)));
  c.simWalletHoldsAgentId = bal !== null && bal > 0n;

  const ts = asInt(await call(address, SELECTORS['totalSupply()']));
  if (ts !== null) c.totalSupply = ts.toString();
  const tm = asInt(await call(address, SELECTORS['totalMinted()']));
  if (tm !== null) c.totalMinted = tm.toString();
  const ms = asInt(await call(address, SELECTORS['maxSupply()'])) ?? asInt(await call(address, SELECTORS['MAX_SUPPLY()']));
  if (ms !== null) c.maxSupply = ms.toString();
  const fm = asInt(await call(address, SELECTORS['freeMinted()']));
  if (fm !== null) c.freeMinted = fm.toString();

  // --- mint probes ---
  const probes = [];
  const tryProbe = async (label, data) => {
    const res = await call(address, data, wallet);
    const ok = typeof res === 'string';
    probes.push({ fn: label, simulates: ok, ...(ok ? {} : { reason: String(res.__error || '').slice(0, 90) }) });
    return ok;
  };

  let abiProbed = false;
  if (src.abi.length) {
    const mintFns = src.abi.filter(
      (e) => e.type === 'function' && /mint|claim/i.test(e.name) && e.stateMutability !== 'view' && e.stateMutability !== 'pure',
    );
    for (const fn of mintFns) {
      const types = (fn.inputs || []).map((i) => i.type);
      const sets = probeArgSets(types, wallet, agentName);
      if (!sets.length) { probes.push({ fn: `${fn.name}(${types.join(',')})`, simulates: false, reason: 'argument shape not probeable automatically' }); continue; }
      abiProbed = true;
      for (const values of sets) {
        let data;
        try { data = sel(`${fn.name}(${types.join(',')})`) + encArgs(types, values); } catch { continue; }
        if (await tryProbe(`${fn.name}(${types.join(',')}) [${values.join(', ')}]`, data)) break;
      }
    }
  }
  if (!abiProbed) {
    const qty1 = encUint(1);
    for (const [label, data] of [
      ['mint()', SELECTORS['mint()']],
      ['mint(uint256) x1', SELECTORS['mint(uint256)'] + qty1],
      ['freeMint()', SELECTORS['freeMint()']],
      ['freeMint(uint256) x1', SELECTORS['freeMint(uint256)'] + qty1],
    ]) await tryProbe(label, data);
  }
  c.mintProbes = probes;
  c.freeMintSimulates = probes.some((p) => p.simulates);
  const win = probes.find((p) => p.simulates);
  if (win) c.freeEntryPoint = win.fn;

  const ow = await call(address, SELECTORS['owner()']);
  if (typeof ow === 'string' && ow !== '0x') c.owner = '0x' + ow.slice(-40);

  const notes = [];
  if (!c.sourceVerified) notes.push('source NOT verified on Sourcify — higher risk');
  else notes.push('source verified (Sourcify exact match)');
  if (c.totalSupply !== undefined && c.maxSupply !== undefined && c.totalSupply === c.maxSupply) notes.push('supply exhausted (sold out)');
  if (c.freeMinted !== undefined) notes.push(`free minted so far: ${c.freeMinted}`);
  if (c.freeMintSimulates) notes.push(`FREE mint simulates cleanly via ${c.freeEntryPoint} from an Agent ID wallet`);
  else notes.push('no zero-value mint simulates from this Agent ID wallet (free lane closed, paid, signature-gated, or already claimed)');
  out.verdict = notes.join(' · ');
  out.reportHash = '0x' + createHash('sha256').update(JSON.stringify(c)).digest('hex');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const addr = process.argv[2];
  if (!addr) { console.error('usage: check.mjs <address> [wallet] [agentName]'); process.exit(2); }
  const res = await checkContract(addr, process.argv[3] || DEFAULT_WALLET, process.argv[4] || DEFAULT_NAME);
  console.log(JSON.stringify(res, null, 2));
}
