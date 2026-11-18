// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal view of the SPACE ID Agent ID registry (ERC-721, non-transferable).
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title MintGuardLog
/// @notice On-chain anchor log for MintGuard, a mint-safety checker built for
///         Binance Agent ID (.ai) holders on BNB Chain.
///
///         What it does:
///         - Holders of an Agent ID can anchor the hash of a mint-safety
///           report they generated for a target contract (anchorCheck).
///         - Holders can check in once per day (checkIn).
///
///         Safety properties (by design):
///         - The contract holds NO assets and has NO payable functions.
///         - It never asks for token approvals and never moves user funds.
///         - There is NO owner and there are NO admin functions. The Agent ID
///           registry address is set once in the constructor and is immutable.
///         - The only gate is Agent ID ownership, read live from the official
///           SPACE ID Agent ID registry on every call.
contract MintGuardLog {
    /// @notice The official Agent ID registry on BNB Chain
    ///         (0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F). Immutable.
    IAgentIdRegistry public immutable agentIdRegistry;

    uint256 public totalChecks;
    uint256 public totalCheckIns;

    mapping(address => uint256) public checksByHolder;
    mapping(address => uint256) public checksOfTarget;
    mapping(address => uint256) public checkInsByHolder;
    mapping(address => uint256) public lastCheckInDay;

    event CheckAnchored(
        address indexed holder,
        address indexed target,
        bytes32 reportHash,
        uint256 checkIndex
    );
    event CheckedIn(address indexed holder, uint256 day, uint256 totalCheckInsByHolder);

    constructor(address registry) {
        require(registry != address(0), "registry is zero address");
        agentIdRegistry = IAgentIdRegistry(registry);
    }

    modifier onlyAgentIdHolder() {
        require(agentIdRegistry.balanceOf(msg.sender) > 0, "Agent ID required");
        _;
    }

    /// @notice Anchor the hash of a MintGuard safety report for `target`.
    /// @param target The contract address the report is about.
    /// @param reportHash Keccak-256 hash of the canonical report text.
    function anchorCheck(address target, bytes32 reportHash) external onlyAgentIdHolder {
        require(target != address(0), "target is zero address");
        require(reportHash != bytes32(0), "report hash is zero");
        totalChecks += 1;
        checksByHolder[msg.sender] += 1;
        checksOfTarget[target] += 1;
        emit CheckAnchored(msg.sender, target, reportHash, totalChecks);
    }

    /// @notice Daily check-in for Agent ID holders. One per holder per UTC day.
    function checkIn() external onlyAgentIdHolder {
        uint256 day = block.timestamp / 1 days;
        require(lastCheckInDay[msg.sender] < day, "already checked in today");
        lastCheckInDay[msg.sender] = day;
        totalCheckIns += 1;
        checkInsByHolder[msg.sender] += 1;
        emit CheckedIn(msg.sender, day, checkInsByHolder[msg.sender]);
    }

    /// @notice True if `who` currently holds an Agent ID.
    function isAgentIdHolder(address who) external view returns (bool) {
        return agentIdRegistry.balanceOf(who) > 0;
    }
}
