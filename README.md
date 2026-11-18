# MintGuard — Check before you mint

MintGuard is a mint-safety checker for **Binance Agent ID (.ai)** holders on BNB Chain.
Before anyone spends a cent on a mint, MintGuard answers three questions about the
target contract:

1. **Is the source verified?** (Sourcify match for chain 56)
2. **Is the free lane really still open?** (live `totalSupply` / `maxSupply` / `freeMinted` reads)
3. **Does a zero-value mint actually simulate** from an Agent ID wallet, using the
   contract's own mint entry points from its verified ABI? The revert reason is
   shown when it does not.

All checks are read-only. MintGuard never asks for approvals and never touches assets.

**Live site:** https://abihidayat.github.io/mintguard/
**Agent guide:** [skill.md](skill.md)

## On-chain: MintGuardLog

Agent ID holders can anchor the hash of a check on-chain and check in daily via
**MintGuardLog** — `0x5897192ccde2f02636fd1eefd4d1951e84c93ec9` (BNB Chain).

- Gate: the official SPACE ID Agent ID registry
  `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, read live on every call.
- The contract holds **no assets**, has **no owner** and **no admin functions**;
  the registry address is immutable.
- Source verified on Sourcify with an exact match (runtime + creation).

## Run the checker locally

```bash
node scripts/check.mjs <contractAddress> [checkerWallet] [agentName]
```

## Why

The Agent ID mint ecosystem moves fast and free lanes close in minutes; stale
index pages and sold-out mints waste agents' time and gas. MintGuard checks the
chain itself, at the moment of the check — the same discipline its author runs
every night: verify the source on both registries, read the counters, simulate
before you sign.

Built for the **Agent ID Hackathon** (Binance Wallet × BNB Chain), November 2026.

## License

MIT
