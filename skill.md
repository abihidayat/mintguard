# MintGuard — agent skill guide

MintGuard is a mint-safety checker for Binance Agent ID (.ai) holders on BNB Chain.
It answers, for any mint contract: is the source verified, is the free lane still
open, and does a zero-value mint simulate cleanly from an Agent ID wallet — before
anyone spends anything. All checks are read-only.

- Site: (this host) — open `index.html`, enter a contract address, run the check.
- Agent ID registry (SPACE ID, BNB Chain): `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`
  — an address holds an Agent ID iff `balanceOf(address) > 0` on this contract.
- MintGuardLog (BNB Chain): `0x5897192ccde2f02636fd1eefd4d1951e84c93ec9`

## Run a check yourself (read-only, no wallet needed)

1. `eth_getCode` the target on any public BSC RPC. No code → stop: not a contract.
2. Sourcify: `GET https://sourcify.dev/server/v2/contract/56/<target>?fields=abi`
   — `match: "exact_match"` means the published source is the deployed code.
   The response carries the contract ABI.
3. Read live counters where present: `totalSupply()`, `maxSupply()`,
   `totalMinted()`, `freeMinted()`.
4. From the ABI, take every non-view function whose name matches /mint|claim/i
   and simulate it with `eth_call`, value 0, `from` = an Agent ID holder wallet,
   with small argument sets (quantities of 1; the holder's Agent ID token id where
   the function takes one). A clean return means the free mint is genuinely open
   for that wallet; otherwise report the revert reason verbatim.
5. Verdict = verified? + sold out? + free minted count + does a free mint simulate?

Reference implementation (Node, stdlib + js-sha3 only): `scripts/check.mjs` in the
MintGuard repository — the website runs the same logic in the browser.

## Anchor a check on-chain (Agent ID holders only)

MintGuardLog stores a public trail of checks. It holds no assets, has no owner,
and its only gate is Agent ID ownership, read live from the registry.

- `anchorCheck(address target, bytes32 reportHash)` — reportHash is the SHA-256
  of the canonical report (the site shows it after every check).
- `checkIn()` — one check-in per holder per UTC day.

With the Binance Agentic Wallet CLI, always preview first and let the preview's
simulation speak before executing:

```
baw contract-call preview --chain bsc --from <your-address> --to 0x5897192ccde2f02636fd1eefd4d1951e84c93ec9 --abi-function "anchorCheck(address,bytes32)" --args '<target>,<reportHash>'
baw contract-call execute --request-id <requestId-from-preview>
```

## Safety notes

- MintGuard never asks for approvals, signatures, or assets to run a check.
- A clean check is a signal, not a guarantee, and not financial advice.
- Never mint a contract whose source is unverified without your human's review.
