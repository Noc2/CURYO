// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SelfVerificationRoot } from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";

/// @title HumanFaucet
/// @notice Allows verified humans (via Self.xyz passport scan) to claim cREP tokens once.
/// @dev Uses Self.xyz zero-knowledge passport verification for sybil resistance.
///      One claim per passport nullifier (same passport can't claim twice).
///      This contract holds a pre-minted supply of 52M cREP for distribution.
contract HumanFaucet is SelfVerificationRoot, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // --- Tier Constants ---

    /// @notice Tier thresholds (cumulative claimant count where each tier ends)
    /// Tier 0 (Genesis): 0-9, Tier 1 (Early Adopter): 10-999, Tier 2 (Pioneer): 1000-9999,
    /// Tier 3 (Explorer): 10000-999999, Tier 4 (Settler): 1000000+
    uint256 public constant TIER_0_THRESHOLD = 10;
    uint256 public constant TIER_1_THRESHOLD = 1_000;
    uint256 public constant TIER_2_THRESHOLD = 10_000;
    uint256 public constant TIER_3_THRESHOLD = 1_000_000;

    /// @notice Claim amounts per tier (6 decimals)
    uint256 public constant TIER_0_AMOUNT = 10_000e6; // 10,000 cREP (Genesis)
    uint256 public constant TIER_1_AMOUNT = 1_000e6; // 1,000 cREP (Early Adopter)
    uint256 public constant TIER_2_AMOUNT = 100e6; // 100 cREP (Pioneer)
    uint256 public constant TIER_3_AMOUNT = 10e6; // 10 cREP (Explorer)
    uint256 public constant TIER_4_AMOUNT = 1e6; // 1 cREP (Settler)

    /// @notice Referral bonus ratio: 50% of claim amount for both claimant bonus and referrer reward
    uint256 public constant REFERRAL_RATIO_BPS = 5000;

    /// @notice Minimum age required for verification (defense-in-depth, hub also enforces)
    uint256 public constant MINIMUM_AGE = 18;

    // --- State ---

    /// @notice The cREP token contract (faucet holds pre-minted balance)
    IERC20 public immutable crepToken;

    /// @notice Verification config ID for the Self.xyz hub
    bytes32 public verificationConfigId;

    /// @notice Track nullifiers that have been used (prevents same passport claiming twice)
    mapping(uint256 => bool) public nullifierUsed;

    /// @notice Track which addresses have claimed (for UI convenience)
    mapping(address => bool) public addressClaimed;

    /// @notice Total cREP tokens claimed through this faucet
    uint256 public totalClaimed;

    /// @notice Total number of unique claimants
    uint256 public totalClaimants;

    /// @notice Track referral counts per address
    mapping(address => uint256) public referralCount;

    /// @notice Track who referred each address (claimant => referrer)
    mapping(address => address) public referredBy;

    /// @notice Total tokens distributed as referral rewards
    uint256 public totalReferralRewards;

    /// @notice Track actual referral earnings per address
    mapping(address => uint256) public referralEarnings;

    /// @notice Reentrancy lock for customVerificationHook (defense-in-depth).
    /// @dev AUDIT NOTE (L-5): `nonReentrant` cannot be applied here because the entry points
    ///      (`verifySelfProof` / `onVerificationSuccess`) are non-virtual in SelfVerificationRoot
    ///      and cannot be overridden. This manual bool guard achieves equivalent protection.
    bool private _claiming;

    /// @notice The Voter ID NFT contract (soulbound token for verified humans)
    IVoterIdNFT public voterIdNFT;

    // --- Events ---

    /// @notice Emitted when tokens are successfully claimed
    event TokensClaimed(address indexed user, uint256 indexed nullifier, uint256 amount);

    /// @notice Emitted when the verification config ID is updated
    event ConfigIdUpdated(bytes32 newConfigId);

    /// @notice Emitted when a referral bonus is distributed
    event ReferralRewardPaid(
        address indexed referrer, address indexed claimant, uint256 referrerReward, uint256 claimantBonus
    );

    /// @notice Emitted when a Voter ID NFT is minted
    event VoterIdMinted(address indexed user, uint256 indexed tokenId, uint256 nullifier);

    /// @notice Emitted when the Voter ID NFT contract is set
    event VoterIdNFTSet(address indexed voterIdNFT);

    /// @notice Emitted when the claim tier changes due to reaching a threshold
    event TierChanged(uint256 newTier, uint256 newClaimAmount, uint256 totalClaimantsCount);

    // --- Errors ---

    /// @notice Thrown when a nullifier has already been used
    error NullifierAlreadyUsed();

    /// @notice Thrown when user identifier is invalid (zero)
    error InvalidUserIdentifier();

    /// @notice Thrown when faucet has insufficient balance
    error InsufficientFaucetBalance();

    /// @notice Thrown when the user does not meet the minimum age requirement (18+)
    error AgeTooYoung();

    // --- Constructor ---

    /// @notice The governance address (timelock) — ownership can only be transferred here
    address public immutable governance;

    /// @notice Deploy the HumanFaucet
    /// @param _crepToken Address of the cREP token contract
    /// @param _identityVerificationHub Address of the Self.xyz IdentityVerificationHub
    /// @param _governance The governance address (timelock) — transferOwnership restricted to this
    constructor(address _crepToken, address _identityVerificationHub, address _governance)
        SelfVerificationRoot(_identityVerificationHub, "curyo-faucet")
        Ownable(msg.sender)
    {
        require(_governance != address(0), "Invalid governance");
        crepToken = IERC20(_crepToken);
        governance = _governance;
    }

    /// @notice Override to restrict ownership transfer to governance only
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner == governance, "Can only transfer to governance");
        super.transferOwnership(newOwner);
    }

    // --- Admin Functions ---

    /// @notice Set the verification config ID (must be created in hub first)
    /// @param _configId The config ID from the Self.xyz hub
    function setConfigId(bytes32 _configId) external onlyOwner {
        verificationConfigId = _configId;
        emit ConfigIdUpdated(_configId);
    }

    /// @notice Withdraw remaining cREP tokens (e.g., after faucet decommissioning)
    /// @param to Address to receive the tokens
    /// @param amount Amount to withdraw (use type(uint256).max for full balance)
    function withdrawRemaining(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 balance = crepToken.balanceOf(address(this));
        uint256 withdrawAmount = amount > balance ? balance : amount;
        require(withdrawAmount > 0, "Nothing to withdraw");
        crepToken.safeTransfer(to, withdrawAmount);
    }

    /// @notice Set the Voter ID NFT contract address
    /// @param _voterIdNFT The Voter ID NFT contract address
    function setVoterIdNFT(address _voterIdNFT) external onlyOwner {
        require(_voterIdNFT != address(0), "Invalid address");
        voterIdNFT = IVoterIdNFT(_voterIdNFT);
        emit VoterIdNFTSet(_voterIdNFT);
    }

    /// @notice Pause the faucet (blocks new claims)
    /// @dev Only callable by owner. Does NOT affect withdrawRemaining().
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the faucet (re-enables claims)
    function unpause() external onlyOwner {
        _unpause();
    }

    // --- View Functions ---

    /// @notice Check if an address has already claimed
    /// @param user The address to check
    /// @return True if the address has claimed
    function hasClaimed(address user) external view returns (bool) {
        return addressClaimed[user];
    }

    /// @notice Check if a nullifier has been used
    /// @param nullifier The nullifier to check
    /// @return True if the nullifier has been used
    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return nullifierUsed[nullifier];
    }

    /// @notice Get the expected proof scope
    /// @return The scope value that proofs must match
    function getScope() external view returns (uint256) {
        return _scope;
    }

    /// @notice Get the current tier based on totalClaimants
    /// @dev AUDIT NOTE (M-3): Tier transitions are discrete cliffs (e.g., 10,000 → 1,000 cREP at
    ///      boundary). This is by design for simplicity and predictability. The UI shows tier info
    ///      so users can anticipate transitions.
    /// @return tier The current tier index (0-4)
    function getCurrentTier() public view returns (uint256 tier) {
        if (totalClaimants < TIER_0_THRESHOLD) return 0;
        if (totalClaimants < TIER_1_THRESHOLD) return 1;
        if (totalClaimants < TIER_2_THRESHOLD) return 2;
        if (totalClaimants < TIER_3_THRESHOLD) return 3;
        return 4;
    }

    /// @notice Get the current claim amount based on tier
    /// @return The claim amount in cREP (6 decimals)
    function getCurrentClaimAmount() public view returns (uint256) {
        uint256 tier = getCurrentTier();
        if (tier == 0) return TIER_0_AMOUNT;
        if (tier == 1) return TIER_1_AMOUNT;
        if (tier == 2) return TIER_2_AMOUNT;
        if (tier == 3) return TIER_3_AMOUNT;
        return TIER_4_AMOUNT;
    }

    /// @notice Get the current referral amounts (50% of claim amount)
    /// @return claimantBonus The bonus for the claimant
    /// @return referrerReward The reward for the referrer
    function getCurrentReferralAmounts() public view returns (uint256 claimantBonus, uint256 referrerReward) {
        uint256 amount = getCurrentClaimAmount();
        claimantBonus = amount * REFERRAL_RATIO_BPS / 10000;
        referrerReward = amount * REFERRAL_RATIO_BPS / 10000;
    }

    /// @notice Get comprehensive tier information for the frontend
    /// @return tier Current tier index (0-4)
    /// @return claimAmount Current claim amount
    /// @return claimantBonus Current referral claimant bonus
    /// @return referrerReward Current referrer reward
    /// @return claimantsInTier Number of claimants so far in current tier
    /// @return claimantsUntilNextTier Remaining claimants before next tier (0 if on final tier)
    function getTierInfo()
        external
        view
        returns (
            uint256 tier,
            uint256 claimAmount,
            uint256 claimantBonus,
            uint256 referrerReward,
            uint256 claimantsInTier,
            uint256 claimantsUntilNextTier
        )
    {
        tier = getCurrentTier();
        claimAmount = getCurrentClaimAmount();
        (claimantBonus, referrerReward) = getCurrentReferralAmounts();

        if (tier == 0) {
            claimantsInTier = totalClaimants;
            claimantsUntilNextTier = TIER_0_THRESHOLD - totalClaimants;
        } else if (tier == 1) {
            claimantsInTier = totalClaimants - TIER_0_THRESHOLD;
            claimantsUntilNextTier = TIER_1_THRESHOLD - totalClaimants;
        } else if (tier == 2) {
            claimantsInTier = totalClaimants - TIER_1_THRESHOLD;
            claimantsUntilNextTier = TIER_2_THRESHOLD - totalClaimants;
        } else if (tier == 3) {
            claimantsInTier = totalClaimants - TIER_2_THRESHOLD;
            claimantsUntilNextTier = TIER_3_THRESHOLD - totalClaimants;
        } else {
            claimantsInTier = totalClaimants - TIER_3_THRESHOLD;
            claimantsUntilNextTier = 0;
        }
    }

    /// @notice Get referral stats for an address
    /// @param user The address to check
    /// @return count Number of successful referrals
    /// @return totalEarned Total tokens earned from referrals
    function getReferralStats(address user) external view returns (uint256 count, uint256 totalEarned) {
        count = referralCount[user];
        totalEarned = referralEarnings[user];
    }

    /// @notice Check if a referral code is valid (user has claimed and has Voter ID)
    /// @param referrer The potential referrer address
    /// @return True if the address has claimed, has Voter ID, and can refer others
    function isValidReferrer(address referrer) external view returns (bool) {
        // Referrer must have claimed
        if (!addressClaimed[referrer]) return false;
        // If Voter ID NFT is set, referrer must also have a Voter ID
        if (address(voterIdNFT) != address(0) && !voterIdNFT.hasVoterId(referrer)) return false;
        return true;
    }

    /// @notice Get remaining cREP balance in the faucet
    /// @return Remaining balance available for claims
    function getRemainingBalance() external view returns (uint256) {
        return crepToken.balanceOf(address(this));
    }

    /// @notice Estimate remaining claims at the current tier rate
    /// @dev Approximate — does not account for tier transitions or referral bonuses
    /// @return Number of remaining claims possible at the current claim amount
    function getRemainingClaims() external view returns (uint256) {
        uint256 balance = crepToken.balanceOf(address(this));
        uint256 currentAmount = getCurrentClaimAmount();
        if (currentAmount == 0) return 0;
        return balance / currentAmount;
    }

    // --- SelfVerificationRoot Overrides ---

    /// @notice Returns the verification config ID for the hub
    /// @dev Required override from SelfVerificationRoot
    function getConfigId(
        bytes32, /* destinationChainId */
        bytes32, /* userIdentifier */
        bytes memory /* userDefinedData */
    )
        public
        view
        override
        returns (bytes32)
    {
        return verificationConfigId;
    }

    /// @notice Called by the hub after successful verification
    /// @dev Transfers cREP tokens from faucet balance to the verified user
    function customVerificationHook(ISelfVerificationRoot.GenericDiscloseOutputV2 memory output, bytes memory userData)
        internal
        override
    {
        require(!_claiming, "Reentrant");
        _claiming = true;

        _requireNotPaused();

        // Validate user identifier
        if (output.userIdentifier == 0) {
            revert InvalidUserIdentifier();
        }

        // Defense-in-depth: verify age (hub already enforces this, but double-check for legal safety)
        if (output.olderThan < MINIMUM_AGE) {
            revert AgeTooYoung();
        }

        // Check nullifier hasn't been used (same passport can't claim twice)
        if (nullifierUsed[output.nullifier]) {
            revert NullifierAlreadyUsed();
        }

        // Derive user address from the verified userIdentifier
        address user = address(uint160(output.userIdentifier));

        // Decode referrer from userData (if present)
        address referrer = _decodeReferrer(userData);

        // Calculate amounts (tier-based rate + proportional referral bonus)
        uint256 claimAmount = getCurrentClaimAmount();
        uint256 referrerReward = 0;
        uint256 claimantBonus = 0;

        // Apply referral logic if valid referrer
        // AUDIT NOTE (L-2): A person with two passports can self-refer (different addresses).
        // This is a protocol-level limitation of pseudonymous identity, not fixable on-chain.
        if (
            referrer != address(0) && referrer != user && addressClaimed[referrer]
                && (address(voterIdNFT) == address(0) || voterIdNFT.hasVoterId(referrer))
        ) {
            (claimantBonus, referrerReward) = getCurrentReferralAmounts();
            claimAmount += claimantBonus;
        }

        // Check faucet has sufficient balance
        uint256 totalRequired = claimAmount + referrerReward;
        if (crepToken.balanceOf(address(this)) < totalRequired) {
            revert InsufficientFaucetBalance();
        }

        // Mark nullifier as used (after balance check to avoid state changes on revert)
        nullifierUsed[output.nullifier] = true;
        addressClaimed[user] = true;

        // Track referral if applicable
        if (referrerReward > 0) {
            referredBy[user] = referrer;
            referralCount[referrer]++;
            referralEarnings[referrer] += referrerReward;
            totalReferralRewards += referrerReward + claimantBonus;
        }

        // Update stats
        totalClaimed += claimAmount + referrerReward;
        totalClaimants++;

        // Emit tier change event if this claim crosses a threshold
        if (
            totalClaimants == TIER_0_THRESHOLD || totalClaimants == TIER_1_THRESHOLD
                || totalClaimants == TIER_2_THRESHOLD || totalClaimants == TIER_3_THRESHOLD
        ) {
            emit TierChanged(getCurrentTier(), getCurrentClaimAmount(), totalClaimants);
        }

        // Transfer tokens to the verified user
        crepToken.safeTransfer(user, claimAmount);

        // Transfer referrer reward if applicable
        if (referrerReward > 0) {
            crepToken.safeTransfer(referrer, referrerReward);
            emit ReferralRewardPaid(referrer, user, referrerReward, claimantBonus);
        }

        emit TokensClaimed(user, output.nullifier, claimAmount);

        // Mint Voter ID NFT if the contract is set
        if (address(voterIdNFT) != address(0)) {
            uint256 tokenId = voterIdNFT.mint(user, output.nullifier);
            emit VoterIdMinted(user, tokenId, output.nullifier);
        }

        _claiming = false;
    }

    /// @notice Decode referrer address from userData
    /// @param userData The user data bytes containing referrer address
    /// @return The referrer address (or zero address if invalid)
    function _decodeReferrer(bytes memory userData) internal pure returns (address) {
        if (userData.length == 0) return address(0);
        if (userData.length == 32) return abi.decode(userData, (address));
        if (userData.length < 20) return address(0);

        address referrer;
        assembly {
            referrer := shr(96, mload(add(userData, 32)))
        }
        return referrer;
    }
}
