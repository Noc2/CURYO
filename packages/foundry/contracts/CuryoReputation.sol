// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title CuryoReputation
/// @notice Reputation token for Curyo platform with governance capabilities.
/// @dev Uses 6 decimals. Includes ERC20Votes for governance and governance-specific token locking.
///      Minter role allows HumanFaucet to mint tokens up to MAX_SUPPLY.
contract CuryoReputation is ERC20, ERC20Permit, ERC20Votes, AccessControl {
    uint8 private constant DECIMALS = 6;
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10 ** DECIMALS; // 100M cREP total cap across faucet, participation, consensus, keeper, treasury, and future governance budgets

    /// @notice Role for minting tokens (granted to HumanFaucet)
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Role for configuring contract references (governor, voting contracts)
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");

    /// @notice Duration tokens are locked after governance participation
    uint256 public constant GOVERNANCE_LOCK_DURATION = 7 days;

    /// @notice Struct to track governance locks
    struct GovernanceLock {
        uint256 amount;
        uint256 unlockTime;
    }

    /// @notice Active governance lock per address (single aggregate lock, O(1) reads/writes)
    mapping(address => GovernanceLock) private _governanceLock;

    /// @notice Governor contract authorized to lock tokens
    address public governor;

    /// @notice Content voting contracts that can receive locked tokens
    address public votingEngine;
    address public contentRegistry;

    event GovernanceLocked(address indexed account, uint256 amount, uint256 unlockTime);
    event GovernorSet(address indexed governor);
    event ContentVotingContractsSet(address indexed votingEngine, address indexed contentRegistry);

    constructor(address _admin, address _governance) ERC20("Curyo Reputation", "cREP") ERC20Permit("Curyo Reputation") {
        require(_governance != address(0), "Invalid governance");

        // Governance gets permanent control
        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(CONFIG_ROLE, _governance);

        // Admin gets temporary setup roles (renounced at end of deploy script)
        if (_admin != _governance) {
            _grantRole(DEFAULT_ADMIN_ROLE, _admin);
            _grantRole(CONFIG_ROLE, _admin);
            _grantRole(MINTER_ROLE, _admin);
        }
    }

    /// @notice Returns 6 decimals.
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Set the governor contract that can lock tokens
    /// @param _governor The governor contract address
    function setGovernor(address _governor) external onlyRole(CONFIG_ROLE) {
        require(_governor != address(0), "Invalid address");
        governor = _governor;
        emit GovernorSet(_governor);
    }

    /// @notice Set the content voting contracts that can receive locked tokens
    /// @param _votingEngine The voting engine address
    /// @param _contentRegistry The content registry address
    function setContentVotingContracts(address _votingEngine, address _contentRegistry) external onlyRole(CONFIG_ROLE) {
        require(_votingEngine != address(0), "Invalid address");
        require(_contentRegistry != address(0), "Invalid address");
        votingEngine = _votingEngine;
        contentRegistry = _contentRegistry;
        emit ContentVotingContractsSet(_votingEngine, _contentRegistry);
    }

    // --- Minting (HumanFaucet) ---

    /// @notice Mint new tokens (only callable by addresses with MINTER_ROLE)
    /// @param to Address to receive the minted tokens
    /// @param amount Amount of tokens to mint
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }

    // --- Governance Lock Functions ---

    /// @notice Lock tokens for governance participation. Called by governor contract.
    /// @dev Uses a single aggregate lock per address (O(1)) instead of unbounded array.
    ///      If an active lock exists, the new amount is added and unlock time is extended.
    ///      If the previous lock expired, a fresh lock is created.
    /// @param account The account whose tokens to lock
    /// @param amount The amount to lock
    function lockForGovernance(address account, uint256 amount) external {
        require(msg.sender == governor, "Only governor");
        require(amount > 0, "Amount must be > 0");

        GovernanceLock storage lock = _governanceLock[account];
        uint256 newUnlockTime = block.timestamp + GOVERNANCE_LOCK_DURATION;

        if (lock.unlockTime <= block.timestamp) {
            // Previous lock expired or no lock exists — start fresh
            lock.amount = amount;
        } else {
            // Active lock — accumulate
            lock.amount += amount;
        }
        lock.unlockTime = newUnlockTime;

        emit GovernanceLocked(account, lock.amount, newUnlockTime);
    }

    /// @notice Get total locked balance for an account
    /// @param account The account to check
    /// @return Total amount currently locked
    function getLockedBalance(address account) public view returns (uint256) {
        GovernanceLock storage lock = _governanceLock[account];
        return lock.unlockTime > block.timestamp ? lock.amount : 0;
    }

    /// @notice Get transferable (unlocked) balance for an account
    /// @param account The account to check
    /// @return Transferable balance
    function getTransferableBalance(address account) public view returns (uint256) {
        uint256 total = balanceOf(account);
        uint256 locked = getLockedBalance(account);
        return total > locked ? total - locked : 0;
    }

    /// @notice Check if an account has any active governance locks
    /// @param account The account to check
    /// @return True if account has locked tokens
    function isLocked(address account) external view returns (bool) {
        return getLockedBalance(account) > 0;
    }

    /// @notice Get the governance lock details for an account
    /// @param account The account to check
    /// @return amount The locked amount (0 if expired)
    /// @return unlockTime The unlock timestamp
    function getGovernanceLock(address account) external view returns (uint256 amount, uint256 unlockTime) {
        GovernanceLock storage lock = _governanceLock[account];
        if (lock.unlockTime > block.timestamp) {
            return (lock.amount, lock.unlockTime);
        }
        return (0, lock.unlockTime);
    }

    // --- ERC20Votes Overrides ---

    /// @dev Check governance locks on transfers, but allow transfers to content voting contracts.
    ///      AUDIT NOTE (L-1): This means the same tokens can count for governance voting power
    ///      (historical snapshot) and content voting stakes simultaneously. This is by design —
    ///      governance uses snapshotted balances, so staking after the snapshot doesn't double-count.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        // Check governance locks for regular transfers (not mints/burns)
        if (from != address(0) && to != address(0)) {
            // Allow transfers TO content voting contracts even if tokens are locked
            bool isContentVoting = (to == votingEngine || to == contentRegistry);

            if (!isContentVoting) {
                // For regular transfers, check transferable balance
                require(value <= getTransferableBalance(from), "Exceeds transferable balance (governance locked)");
            }
        }

        super._update(from, to, value);

        // Auto-delegate to self on first token receipt (enables governance voting by default)
        if (to != address(0) && delegates(to) == address(0)) {
            _delegate(to, to);
        }
    }

    /// @dev Only self-delegation is allowed. Users vote with their own tokens; no proxy voting.
    function _delegate(address account, address delegatee) internal override {
        require(delegatee == account, "Only self-delegation allowed");
        super._delegate(account, delegatee);
    }

    /// @notice Returns the current nonce for an address (required override for ERC20Permit/Nonces)
    function nonces(address owner) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }

    /// @notice Clock mode for ERC20Votes (uses block numbers)
    function clock() public view override returns (uint48) {
        return uint48(block.number);
    }

    /// @notice Returns the clock mode description
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=blocknumber&from=default";
    }

    /// @notice ERC165 interface support (required override for AccessControl)
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
