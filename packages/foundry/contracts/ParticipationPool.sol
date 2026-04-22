// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IParticipationPool} from "./interfaces/IParticipationPool.sol";

/// @title ParticipationPool
/// @notice Distributes cREP rewards proportional to stake for voting and submitting content, with distribution-based halving.
/// @dev Funded with 12M cREP. Early participants earn more — the reward rate halves as cumulative cREP distributed grows.
///      Reward = stakeAmount × currentRateBps / 10000. Rate starts at 90% and halves per tier.
contract ParticipationPool is IParticipationPool, Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // --- Constants ---

    /// @notice Initial reward rate in basis points (90%)
    uint256 public constant INITIAL_RATE_BPS = 9000;

    /// @notice cREP distributed in the first halving tier (1.5M cREP, 6 decimals)
    uint256 public constant INITIAL_TIER_AMOUNT = 1_500_000e6;

    /// @notice Minimum reward rate floor in basis points (1%)
    uint256 public constant MIN_RATE_BPS = 100;

    // --- State ---

    /// @notice The cREP token contract
    IERC20 public immutable crepToken;

    /// @notice The governance address — ownership can only be transferred here
    address public immutable governance;

    /// @notice Cumulative cREP distributed from the pool (drives halving schedule)
    uint256 public totalDistributed;

    /// @notice Remaining cREP balance tracked internally
    uint256 public poolBalance;

    /// @notice Total cREP reserved for future pull-based claims but not yet withdrawn.
    uint256 public reservedBalance;

    /// @notice Addresses authorized to trigger rewards (VotingEngine, ContentRegistry)
    mapping(address => bool) public authorizedCallers;

    /// @notice Reserved reward balances keyed by beneficiary contract.
    mapping(address => uint256) public reservedRewards;

    // --- Events ---

    /// @notice Emitted when a participation reward is distributed
    event ParticipationReward(address indexed recipient, uint256 amount, uint256 totalDistributedAfter);

    /// @notice Emitted when an authorized caller is added or removed
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    /// @notice Emitted when tokens are deposited into the pool
    event PoolDeposit(uint256 amount);

    /// @notice Emitted when tokens are withdrawn from the pool
    event PoolWithdrawal(address indexed to, uint256 amount);

    /// @notice Emitted when accidentally transferred surplus tokens are recovered
    event SurplusRecovered(address indexed to, uint256 amount);

    /// @notice Emitted when a reward is capped due to pool depletion (M-5 fix)
    event RewardCapped(address indexed recipient, uint256 requested, uint256 actual);

    /// @notice Emitted when rewards are reserved for later withdrawal.
    event RewardReserved(address indexed beneficiary, uint256 amount, uint256 totalDistributedAfter);

    /// @notice Emitted when reserved rewards are withdrawn.
    event ReservedRewardWithdrawn(address indexed beneficiary, address indexed recipient, uint256 amount);

    /// @notice Emitted when reserved rewards are released back into the pool.
    event ReservedRewardReleased(address indexed beneficiary, uint256 amount, uint256 totalDistributedAfter);

    // --- Modifiers ---

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    // --- Constructor ---

    /// @param _crepToken Address of the cREP token contract
    /// @param _governance The governance address (timelock)
    constructor(address _crepToken, address _governance) Ownable(msg.sender) {
        require(_crepToken != address(0), "Invalid token");
        require(_governance != address(0), "Invalid governance");
        crepToken = IERC20(_crepToken);
        governance = _governance;
    }

    /// @notice Override to restrict ownership transfer to governance only
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner == governance, "Can only transfer to governance");
        super.transferOwnership(newOwner);
    }

    /// @notice Prevent accidental ownership renunciation (L-5 fix)
    function renounceOwnership() public pure override {
        revert("Renounce disabled");
    }

    // --- Admin Functions ---

    /// @notice Add or remove an authorized caller
    /// @param caller The address to authorize/deauthorize
    /// @param authorized Whether the caller is authorized
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "Invalid address");
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    /// @notice Deposit cREP tokens into the participation pool
    /// @param amount Amount of cREP to deposit
    function depositPool(uint256 amount) external {
        require(amount > 0, "Zero amount");
        crepToken.safeTransferFrom(msg.sender, address(this), amount);
        poolBalance += amount;
        emit PoolDeposit(amount);
    }

    /// @notice Withdraw undistributed and unreserved cREP tracked in poolBalance.
    /// @dev This emergency path is owner-only (governance timelock after handoff) and cannot
    ///      touch funds reserved for beneficiary contracts via reserveReward().
    /// @param to Address to receive tokens
    /// @param amount Amount to withdraw (use type(uint256).max for full tracked pool balance)
    function withdrawRemaining(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid address");
        require(owner() == governance, "Governance handoff required");

        uint256 withdrawable = poolBalance;
        uint256 withdrawAmount = amount > withdrawable ? withdrawable : amount;
        require(withdrawAmount > 0, "Nothing to withdraw");

        poolBalance = withdrawable - withdrawAmount;
        crepToken.safeTransfer(to, withdrawAmount);

        emit PoolWithdrawal(to, withdrawAmount);
    }

    /// @notice Recover tokens that were transferred directly to the contract without increasing poolBalance.
    /// @param to Address to receive the recovered surplus
    /// @param amount Amount to recover (use type(uint256).max for the full surplus)
    function recoverSurplus(address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
        returns (uint256 recoveredAmount)
    {
        require(to != address(0), "Invalid address");

        uint256 actualBalance = crepToken.balanceOf(address(this));
        uint256 accountedBalance = poolBalance + reservedBalance;
        uint256 surplus = actualBalance > accountedBalance ? actualBalance - accountedBalance : 0;
        recoveredAmount = amount > surplus ? surplus : amount;
        require(recoveredAmount > 0, "Nothing to recover");

        crepToken.safeTransfer(to, recoveredAmount);
        emit SurplusRecovered(to, recoveredAmount);
    }

    // --- View Functions ---

    /// @notice Get the current reward rate in basis points based on the distribution halving schedule
    /// @dev Each tier doubles in cREP amount and halves the rate. Starts at 90% (9000 BPS), floor at 1% (100 BPS).
    /// @return The current rate in basis points
    function getCurrentRateBps() public view returns (uint256) {
        uint256 rate = INITIAL_RATE_BPS;
        uint256 threshold = INITIAL_TIER_AMOUNT;
        uint256 tierSize = INITIAL_TIER_AMOUNT * 2;
        while (totalDistributed >= threshold && rate > MIN_RATE_BPS) {
            rate /= 2;
            threshold += tierSize;
            tierSize *= 2;
        }
        return rate < MIN_RATE_BPS ? MIN_RATE_BPS : rate;
    }

    // --- Reward Functions ---

    /// @notice Distribute a pre-computed reward amount. Called by RoundVotingEngine for pull-based claims.
    /// @dev Uses a rate snapshotted at settlement time rather than the live rate.
    /// @param voter The address to reward
    /// @param amount The pre-computed reward amount
    /// @return paidAmount The actual amount distributed (can be less than requested if depleted)
    function distributeReward(address voter, uint256 amount)
        external
        onlyAuthorized
        nonReentrant
        returns (uint256 paidAmount)
    {
        return _distribute(voter, amount);
    }

    /// @inheritdoc IParticipationPool
    function reserveReward(address beneficiary, uint256 amount)
        external
        onlyAuthorized
        nonReentrant
        returns (uint256 reservedAmount)
    {
        require(beneficiary != address(0), "Invalid beneficiary");
        if (amount > poolBalance) {
            emit RewardCapped(beneficiary, amount, poolBalance);
            amount = poolBalance;
        }
        if (amount == 0) return 0;

        totalDistributed += amount;
        poolBalance -= amount;
        reservedBalance += amount;
        reservedRewards[beneficiary] += amount;

        emit RewardReserved(beneficiary, amount, totalDistributed);
        return amount;
    }

    /// @inheritdoc IParticipationPool
    function withdrawReservedReward(address recipient, uint256 amount)
        external
        nonReentrant
        returns (uint256 paidAmount)
    {
        require(recipient != address(0), "Invalid recipient");

        uint256 reservedForBeneficiary = reservedRewards[msg.sender];
        paidAmount = amount > reservedForBeneficiary ? reservedForBeneficiary : amount;
        require(paidAmount > 0, "No reserved reward");

        reservedRewards[msg.sender] = reservedForBeneficiary - paidAmount;
        reservedBalance -= paidAmount;
        crepToken.safeTransfer(recipient, paidAmount);

        emit ReservedRewardWithdrawn(msg.sender, recipient, paidAmount);
    }

    /// @inheritdoc IParticipationPool
    function releaseReservedReward(uint256 amount) external nonReentrant returns (uint256 releasedAmount) {
        uint256 reservedForBeneficiary = reservedRewards[msg.sender];
        require(amount <= reservedForBeneficiary, "Insufficient reserved reward");
        if (amount == 0) return 0;

        reservedRewards[msg.sender] = reservedForBeneficiary - amount;
        reservedBalance -= amount;
        poolBalance += amount;
        totalDistributed -= amount;

        emit ReservedRewardReleased(msg.sender, amount, totalDistributed);
        return amount;
    }

    /// @dev Internal distribution logic — caps at remaining pool balance
    function _distribute(address recipient, uint256 reward) internal returns (uint256 paidAmount) {
        if (reward > poolBalance) {
            emit RewardCapped(recipient, reward, poolBalance);
            reward = poolBalance;
        }
        if (reward == 0) return 0;

        totalDistributed += reward;
        poolBalance -= reward;
        crepToken.safeTransfer(recipient, reward);

        emit ParticipationReward(recipient, reward, totalDistributed);
        return reward;
    }
}
