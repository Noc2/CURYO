// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { SelfVerificationRoot } from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";

/// @title HumanFaucet
/// @notice Allows verified humans with governance-approved Self.xyz credentials to claim HREP tokens once.
/// @dev Uses Self.xyz zero-knowledge identity verification for sybil resistance.
///      One claim per document nullifier (the same verified identity document can't claim twice).
///      This contract holds the 52M faucet allocation minted at launch.
contract HumanFaucet is SelfVerificationRoot, EIP712, Ownable, Pausable {
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
    uint256 public constant TIER_0_AMOUNT = 10_000e6; // 10,000 HREP (Genesis)
    uint256 public constant TIER_1_AMOUNT = 1_000e6; // 1,000 HREP (Early Adopter)
    uint256 public constant TIER_2_AMOUNT = 100e6; // 100 HREP (Pioneer)
    uint256 public constant TIER_3_AMOUNT = 10e6; // 10 HREP (Explorer)
    uint256 public constant TIER_4_AMOUNT = 1e6; // 1 HREP (Settler)

    /// @notice Referral bonus ratio: 50% of claim amount for both claimant bonus and referrer reward
    uint256 public constant REFERRAL_RATIO_BPS = 5000;

    /// @notice Maximum migrated claims accepted in one bootstrap transaction.
    uint256 internal constant MIGRATION_BOOTSTRAP_MAX_BATCH_SIZE = 100;

    /// @notice Allowed Self.xyz attestation IDs
    bytes32 public constant PASSPORT_ATTESTATION_ID = bytes32(uint256(1));
    bytes32 public constant BIOMETRIC_ID_CARD_ATTESTATION_ID = bytes32(uint256(2));
    bytes32 public constant KYC_ATTESTATION_ID = bytes32(uint256(4));

    /// @notice Minimum Self.xyz age disclosure required for faucet claims
    uint256 public constant MINIMUM_FAUCET_AGE = 18;

    /// @notice EIP-712 type hash for recipient-controlled faucet claim authorization.
    bytes32 public constant FAUCET_CLAIM_AUTHORIZATION_TYPEHASH =
        keccak256("FaucetClaimAuthorization(address recipient,address referrer,uint256 nonce,uint256 deadline)");

    struct AttestationPolicy {
        bool enabled;
        bool[3] requiredOfac;
    }

    // --- State ---

    /// @notice The HREP token contract (faucet holds pre-minted balance)
    IERC20 public immutable hrepToken;

    /// @notice Verification config ID for the Self.xyz hub
    bytes32 public verificationConfigId;

    /// @notice Track nullifiers that have been used (prevents same passport claiming twice)
    mapping(uint256 => bool) public nullifierUsed;

    /// @notice Track which addresses have claimed (enforces one claim per address)
    mapping(address => bool) public addressClaimed;

    /// @notice Total HREP tokens claimed through this faucet
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

    /// @notice Track which nullifier each claimed address used for migration and retry bookkeeping.
    mapping(address => uint256) public claimNullifier;

    /// @notice One-way switch that disables deploy-time migrated claim bootstrapping.
    bool public migrationBootstrapClosed;

    /// @notice When enabled, Self callback userData must include recipient-signed claim authorization.
    bool public recipientAuthorizationRequired;

    /// @notice Per-recipient nonce consumed by EIP-712 faucet claim authorizations.
    mapping(address => uint256) public recipientAuthorizationNonces;

    /// @notice Governance-controlled acceptance and sanctions requirements for Self.xyz attestation IDs.
    mapping(bytes32 => AttestationPolicy) private _attestationPolicies;

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

    /// @notice Emitted when the governance address is updated
    event GovernanceUpdated(address indexed governance);

    /// @notice Emitted when Voter ID minting fails (claim still succeeds)
    // Note: VoterIdMintFailed was removed. Voter ID mint failures now revert the whole
    // claim atomically in customVerificationHook, so the failure state is never reached.

    /// @notice Emitted when the claim tier changes due to reaching a threshold
    event TierChanged(uint256 newTier, uint256 newClaimAmount, uint256 totalClaimantsCount);

    /// @notice Emitted when governance withdraws remaining faucet funds while paused
    event RemainingWithdrawn(address indexed to, uint256 amount);

    /// @notice Emitted when a prior deployment claim is replayed during a redeploy migration
    event MigratedClaimBootstrapped(
        address indexed user,
        uint256 indexed nullifier,
        uint256 amount,
        address referrer,
        uint256 claimantBonus,
        uint256 referrerReward,
        uint256 tokenId
    );

    /// @notice Emitted when migrated claim bootstrapping is permanently closed
    event MigrationBootstrapClosed();

    /// @notice Emitted when governance updates which Self.xyz credentials can claim.
    event AttestationPolicyUpdated(bytes32 indexed attestationId, bool enabled, bool[3] requiredOfac);

    /// @notice Emitted when governance toggles recipient wallet authorization for public claims.
    event RecipientAuthorizationRequiredSet(bool required);

    // --- Errors ---

    /// @notice Thrown when a nullifier has already been used
    error NullifierAlreadyUsed();

    /// @notice Thrown when an address has already claimed
    error AddressAlreadyClaimed();

    /// @notice Thrown when user identifier is invalid (zero)
    error InvalidUserIdentifier();

    /// @notice Thrown when faucet has insufficient balance
    error InsufficientFaucetBalance();

    /// @notice Thrown when the proof was generated from an unsupported document type
    error UnsupportedDocumentType();

    /// @notice Thrown when Self.xyz output does not confirm sanctions screening passed
    error SanctionsCheckFailed();

    /// @notice Thrown when Self.xyz output does not prove the claimant is old enough
    error MinimumAgeNotMet();

    /// @notice Thrown when governance attempts to configure an invalid attestation policy
    error InvalidAttestationPolicy();

    /// @notice Thrown when migrated claim bootstrap has been closed
    error MigrationBootstrapAlreadyClosed();

    /// @notice Thrown when migration array lengths do not match
    error MigrationArrayLengthMismatch();

    /// @notice Thrown when a migration bootstrap call is too large for a bounded replay transaction
    error MigrationBootstrapBatchTooLarge();

    /// @notice Thrown when a migrated claim contains invalid data
    error InvalidMigrationClaim();

    /// @notice Thrown when migrated referral data is not valid
    error InvalidMigrationReferrer();

    /// @notice Thrown when a production faucet claim omits recipient authorization.
    error MissingClaimAuthorization();

    /// @notice Thrown when governance tries to disable recipient authorization after enabling it.
    error RecipientAuthorizationCannotBeDisabled();

    /// @notice Thrown when a faucet recipient authorization is expired.
    error ClaimAuthorizationExpired();

    /// @notice Thrown when a faucet recipient authorization signature is invalid.
    error InvalidClaimAuthorization();

    // --- Constructor ---

    /// @notice The governance address (timelock) — ownership can only be transferred here
    address public governance;

    /// @notice Deploy the HumanFaucet
    /// @param _hrepToken Address of the HREP token contract
    /// @param _identityVerificationHub Address of the Self.xyz IdentityVerificationHub
    /// @param _governance The governance address (timelock) — transferOwnership restricted to this
    constructor(address _hrepToken, address _identityVerificationHub, address _governance)
        SelfVerificationRoot(_identityVerificationHub, "curyo-faucet")
        EIP712("Curyo Human Faucet", "1")
        Ownable(msg.sender)
    {
        require(_governance != address(0), "Invalid governance");
        hrepToken = IERC20(_hrepToken);
        governance = _governance;

        _setAttestationPolicy(PASSPORT_ATTESTATION_ID, true, [true, true, true]);
        _setAttestationPolicy(BIOMETRIC_ID_CARD_ATTESTATION_ID, true, [false, true, true]);
        _setAttestationPolicy(KYC_ATTESTATION_ID, true, [false, true, true]);
    }

    /// @notice Update the governance address that ownership may migrate to.
    /// @dev Current owner (the existing governance timelock) can retarget this before a governance migration.
    function setGovernance(address newGovernance) external onlyOwner {
        require(newGovernance != address(0), "Invalid governance");
        governance = newGovernance;
        emit GovernanceUpdated(newGovernance);
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

    /// @notice Set the verification config ID after confirming the hub recognizes it
    /// @param _configId The config ID from the Self.xyz hub
    function setConfigId(bytes32 _configId) external onlyOwner {
        require(_configId != bytes32(0), "Invalid config");
        require(_identityVerificationHubV2.verificationConfigV2Exists(_configId), "Unknown config");
        verificationConfigId = _configId;
        emit ConfigIdUpdated(_configId);
    }

    /// @notice Update which Self.xyz attestation IDs may claim and which sanctions checks must pass.
    /// @dev Owner is governance after deployment, so production changes go through timelock governance.
    ///      `requiredOfac` indexes follow Self.xyz's output: [document number, name+DOB, name+YOB].
    function setAttestationPolicy(bytes32 attestationId, bool enabled, bool[3] memory requiredOfac) external onlyOwner {
        _setAttestationPolicy(attestationId, enabled, requiredOfac);
    }

    /// @notice Require recipient-signed EIP-712 authorization in Self callback userData.
    /// @dev Production launch requires this to be enabled before ownership handoff.
    function setRecipientAuthorizationRequired(bool required) external onlyOwner {
        if (!required && recipientAuthorizationRequired) revert RecipientAuthorizationCannotBeDisabled();
        recipientAuthorizationRequired = required;
        emit RecipientAuthorizationRequiredSet(required);
    }

    /// @notice Withdraw remaining HREP tokens (e.g., after faucet decommissioning)
    /// @dev Only available while paused so governance must halt new claims before migration or recovery.
    /// @param to Address to receive the tokens
    /// @param amount Amount to withdraw (use type(uint256).max for full balance)
    function withdrawRemaining(address to, uint256 amount) external onlyOwner {
        require(owner() == governance, "Governance ownership required");
        require(paused(), "Pause required");
        require(to != address(0), "Invalid address");

        uint256 balance = hrepToken.balanceOf(address(this));
        uint256 withdrawnAmount = amount > balance ? balance : amount;
        require(withdrawnAmount > 0, "Nothing to withdraw");

        hrepToken.safeTransfer(to, withdrawnAmount);
        emit RemainingWithdrawn(to, withdrawnAmount);
    }

    /// @notice Set the Voter ID NFT contract address
    /// @param _voterIdNFT The Voter ID NFT contract address
    function setVoterIdNFT(address _voterIdNFT) external onlyOwner {
        require(_voterIdNFT != address(0), "Invalid address");
        voterIdNFT = IVoterIdNFT(_voterIdNFT);
        emit VoterIdNFTSet(_voterIdNFT);
    }

    /// @notice Retry minting a Voter ID for a user whose mint failed during claim (M-6 design gap fix)
    /// @param user The address that claimed but didn't receive a Voter ID
    function retryVoterIdMint(address user) external onlyOwner {
        require(addressClaimed[user], "User has not claimed");
        uint256 nullifier = claimNullifier[user];
        require(nullifier != 0, "No nullifier recorded");
        require(address(voterIdNFT) != address(0), "VoterIdNFT not set");
        require(voterIdNFT.resolveHolder(user) != user, "User already has direct Voter ID");

        uint256 tokenId = voterIdNFT.mint(user, nullifier);
        emit VoterIdMinted(user, tokenId, nullifier);
    }

    /// @notice Replay verified faucet claims from a prior deployment during a controlled redeploy migration.
    /// @dev Intended to run before governance handoff and before the public faucet opens. Amounts are explicit so the
    ///      migration can preserve historical referral bonuses or exact claim amounts from old events.
    function bootstrapMigratedClaims(
        address[] calldata users,
        uint256[] calldata nullifiers,
        uint256[] calldata amounts,
        address[] calldata referrers,
        uint256[] calldata claimantBonuses,
        uint256[] calldata referrerRewards
    ) external onlyOwner {
        if (migrationBootstrapClosed) revert MigrationBootstrapAlreadyClosed();
        if (
            users.length != nullifiers.length || users.length != amounts.length || users.length != referrers.length
                || users.length != claimantBonuses.length || users.length != referrerRewards.length
        ) {
            revert MigrationArrayLengthMismatch();
        }
        if (users.length > MIGRATION_BOOTSTRAP_MAX_BATCH_SIZE) {
            revert MigrationBootstrapBatchTooLarge();
        }
        require(address(voterIdNFT) != address(0), "VoterIdNFT not set");

        for (uint256 i = 0; i < users.length; ++i) {
            _bootstrapMigratedClaim(
                users[i], nullifiers[i], amounts[i], referrers[i], claimantBonuses[i], referrerRewards[i]
            );
        }
    }

    /// @notice Permanently close migrated-claim bootstrapping.
    /// @dev The deploy script closes this before transferring ownership to governance.
    function closeMigrationBootstrap() external onlyOwner {
        if (!migrationBootstrapClosed) {
            migrationBootstrapClosed = true;
            emit MigrationBootstrapClosed();
        }
    }

    /// @notice Pause the faucet (blocks new claims)
    /// @dev Only callable by owner. Governance must pause before withdrawing remaining funds.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the faucet (re-enables claims)
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Final production launch step: open public claims and hand ownership to governance atomically.
    function openClaimsAndTransferOwnership() external onlyOwner {
        require(paused(), "Pause required");
        require(migrationBootstrapClosed, "Bootstrap open");
        require(verificationConfigId != bytes32(0), "Config not set");
        require(address(voterIdNFT) != address(0), "VoterIdNFT not set");
        require(recipientAuthorizationRequired, "Recipient auth off");
        _unpause();
        transferOwnership(governance);
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
    /// @dev AUDIT NOTE (M-3): Tier transitions are discrete cliffs (e.g., 10,000 → 1,000 HREP at
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
    /// @return The claim amount in HREP (6 decimals)
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
        // Referrer must be a direct Voter ID holder, not a delegate. Using resolveHolder ensures
        // a revoked user who was later made someone's delegate cannot keep earning referral rewards.
        if (address(voterIdNFT) != address(0) && voterIdNFT.resolveHolder(referrer) != referrer) return false;
        return true;
    }

    /// @notice Get remaining HREP balance in the faucet
    /// @return Remaining balance available for claims
    function getRemainingBalance() external view returns (uint256) {
        return hrepToken.balanceOf(address(this));
    }

    /// @notice Estimate remaining claims at the current tier rate
    /// @dev Approximate — does not account for tier transitions or referral bonuses
    /// @return Number of remaining claims possible at the current claim amount
    function getRemainingClaims() external view returns (uint256) {
        uint256 balance = hrepToken.balanceOf(address(this));
        uint256 currentAmount = getCurrentClaimAmount();
        if (currentAmount == 0) return 0;
        return balance / currentAmount;
    }

    /// @notice Read the current policy for a Self.xyz attestation ID.
    function getAttestationPolicy(bytes32 attestationId)
        external
        view
        returns (bool enabled, bool[3] memory requiredOfac)
    {
        AttestationPolicy memory policy = _attestationPolicies[attestationId];
        return (policy.enabled, policy.requiredOfac);
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
    /// @dev Transfers HREP tokens from faucet balance to the verified user
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

        // Defense-in-depth: allow only governance-approved Self.xyz credentials and require sanctions clearance.
        _validateAttestationPolicy(output.attestationId, output.ofac);

        if (output.olderThan < MINIMUM_FAUCET_AGE) {
            revert MinimumAgeNotMet();
        }

        // Check nullifier hasn't been used (same passport can't claim twice)
        if (nullifierUsed[output.nullifier]) {
            revert NullifierAlreadyUsed();
        }

        // Derive user address from the verified userIdentifier
        address user = address(uint160(output.userIdentifier));

        // Defense-in-depth: block repeated claims to the same wallet even with a fresh passport nullifier
        if (addressClaimed[user]) {
            revert AddressAlreadyClaimed();
        }

        (address referrer, uint256 authDeadline, bytes memory authSignature) = _decodeClaimUserData(userData);
        if (recipientAuthorizationRequired) {
            _requireClaimAuthorization(user, referrer, authDeadline, authSignature);
        }

        // Calculate amounts (tier-based rate + proportional referral bonus)
        uint256 claimAmount = getCurrentClaimAmount();
        uint256 referrerReward = 0;
        uint256 claimantBonus = 0;

        // Apply referral logic if valid referrer
        // AUDIT NOTE (L-2): A person with two passports can self-refer (different addresses).
        // This is a protocol-level limitation of pseudonymous identity, not fixable on-chain.
        if (
            referrer != address(0) && referrer != user && addressClaimed[referrer]
                && (address(voterIdNFT) == address(0) || voterIdNFT.resolveHolder(referrer) == referrer)
        ) {
            (claimantBonus, referrerReward) = getCurrentReferralAmounts();
            claimAmount += claimantBonus;
        }

        // Check faucet has sufficient balance
        uint256 totalRequired = claimAmount + referrerReward;
        if (hrepToken.balanceOf(address(this)) < totalRequired) {
            revert InsufficientFaucetBalance();
        }

        // Mark nullifier as used (after balance check to avoid state changes on revert)
        nullifierUsed[output.nullifier] = true;
        addressClaimed[user] = true;
        claimNullifier[user] = output.nullifier;

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
        hrepToken.safeTransfer(user, claimAmount);

        // Transfer referrer reward if applicable
        if (referrerReward > 0) {
            hrepToken.safeTransfer(referrer, referrerReward);
            emit ReferralRewardPaid(referrer, user, referrerReward, claimantBonus);
        }

        emit TokensClaimed(user, output.nullifier, claimAmount);

        // Mint Voter ID NFT if the contract is set; failures revert the whole claim.
        if (address(voterIdNFT) != address(0)) {
            uint256 tokenId = voterIdNFT.mint(user, output.nullifier);
            emit VoterIdMinted(user, tokenId, output.nullifier);
        }

        _claiming = false;
    }

    function _requireClaimAuthorization(address user, address referrer, uint256 deadline, bytes memory signature)
        internal
    {
        if (signature.length == 0) revert MissingClaimAuthorization();
        if (deadline < block.timestamp) revert ClaimAuthorizationExpired();

        uint256 nonce = recipientAuthorizationNonces[user];
        bytes32 structHash = keccak256(abi.encode(FAUCET_CLAIM_AUTHORIZATION_TYPEHASH, user, referrer, nonce, deadline));
        if (!SignatureChecker.isValidSignatureNow(user, _hashTypedDataV4(structHash), signature)) {
            revert InvalidClaimAuthorization();
        }
        recipientAuthorizationNonces[user] = nonce + 1;
    }

    function _bootstrapMigratedClaim(
        address user,
        uint256 nullifier,
        uint256 amount,
        address referrer,
        uint256 claimantBonus,
        uint256 referrerReward
    ) internal {
        if (user == address(0) || nullifier == 0 || amount == 0 || claimantBonus > amount) {
            revert InvalidMigrationClaim();
        }
        if (nullifierUsed[nullifier]) {
            revert NullifierAlreadyUsed();
        }
        if (addressClaimed[user]) {
            revert AddressAlreadyClaimed();
        }

        if (referrer == address(0)) {
            if (claimantBonus != 0 || referrerReward != 0) {
                revert InvalidMigrationClaim();
            }
        } else if (
            referrer == user || claimantBonus == 0 || referrerReward == 0 || !addressClaimed[referrer]
                || voterIdNFT.resolveHolder(referrer) != referrer
        ) {
            // Require the referrer to be a direct Voter ID holder (not a delegate), mirroring
            // the live claim path in `customVerificationHook`. Bootstrap is owner-only and
            // closed before handoff, so the risk is low; this keeps the two paths consistent
            // so future refactors can't quietly diverge.
            revert InvalidMigrationReferrer();
        }

        uint256 totalRequired = amount + referrerReward;
        if (hrepToken.balanceOf(address(this)) < totalRequired) {
            revert InsufficientFaucetBalance();
        }

        nullifierUsed[nullifier] = true;
        addressClaimed[user] = true;
        claimNullifier[user] = nullifier;

        if (referrer != address(0)) {
            referredBy[user] = referrer;
            referralCount[referrer]++;
            referralEarnings[referrer] += referrerReward;
            totalReferralRewards += referrerReward + claimantBonus;
        }

        totalClaimed += totalRequired;
        totalClaimants++;

        if (
            totalClaimants == TIER_0_THRESHOLD || totalClaimants == TIER_1_THRESHOLD
                || totalClaimants == TIER_2_THRESHOLD || totalClaimants == TIER_3_THRESHOLD
        ) {
            emit TierChanged(getCurrentTier(), getCurrentClaimAmount(), totalClaimants);
        }

        hrepToken.safeTransfer(user, amount);
        if (referrerReward > 0) {
            hrepToken.safeTransfer(referrer, referrerReward);
            emit ReferralRewardPaid(referrer, user, referrerReward, claimantBonus);
        }

        emit TokensClaimed(user, nullifier, amount);

        uint256 tokenId = voterIdNFT.mint(user, nullifier);
        emit VoterIdMinted(user, tokenId, nullifier);
        emit MigratedClaimBootstrapped(user, nullifier, amount, referrer, claimantBonus, referrerReward, tokenId);
    }

    /// @notice Decode claim callback data, including optional recipient authorization.
    /// @param userData Self.xyz callback user data.
    function _decodeClaimUserData(bytes memory userData)
        internal
        pure
        returns (address referrer, uint256 deadline, bytes memory signature)
    {
        bytes memory payload = userData;
        if (_isHexData(userData)) {
            bytes memory decoded = _decodeHexBytes(userData);
            if (decoded.length >= 128 && _hasClaimAuthorizationMagic(decoded)) {
                payload = decoded;
            }
        }
        if (payload.length >= 128 && _hasClaimAuthorizationMagic(payload)) {
            (bytes4 magic, address encodedReferrer, uint256 encodedDeadline, bytes memory encodedSignature) =
                abi.decode(payload, (bytes4, address, uint256, bytes));
            if (magic == bytes4("HFCA")) {
                return (encodedReferrer, encodedDeadline, encodedSignature);
            }
        }
        return (_decodeReferrer(userData), 0, "");
    }

    function _decodeReferrer(bytes memory userData) internal pure returns (address) {
        if (userData.length == 0) return address(0);
        if (
            userData.length == 42 && userData[0] == bytes1("0")
                && (userData[1] == bytes1("x") || userData[1] == bytes1("X"))
        ) {
            return _decodeHexStringAddress(userData, 2);
        }
        if (userData.length == 40) {
            return _decodeHexStringAddress(userData, 0);
        }
        if (userData.length == 32) return abi.decode(userData, (address));
        if (userData.length < 20) return address(0);

        // Legacy callers may still send abi.encodePacked(address), so left-pad the first 20 bytes
        // into a standard 32-byte ABI word before decoding.
        bytes memory padded = new bytes(32);
        for (uint256 i = 0; i < 20; ++i) {
            padded[12 + i] = userData[i];
        }
        return abi.decode(padded, (address));
    }

    function _decodeHexStringAddress(bytes memory userData, uint256 start) internal pure returns (address) {
        uint160 parsed = 0;
        for (uint256 i = start; i < userData.length; ++i) {
            uint8 nibble = _fromHexChar(uint8(userData[i]));
            if (nibble == type(uint8).max) {
                return address(0);
            }
            parsed = (parsed << 4) | uint160(nibble);
        }
        return address(parsed);
    }

    function _isHexData(bytes memory userData) internal pure returns (bool) {
        if (
            userData.length < 2 || userData[0] != bytes1("0")
                || (userData[1] != bytes1("x") && userData[1] != bytes1("X"))
        ) {
            return false;
        }
        return userData.length % 2 == 0;
    }

    function _hasClaimAuthorizationMagic(bytes memory payload) internal pure returns (bool) {
        if (payload.length < 4) return false;
        return payload[0] == bytes1("H") && payload[1] == bytes1("F") && payload[2] == bytes1("C")
            && payload[3] == bytes1("A");
    }

    function _decodeHexBytes(bytes memory userData) internal pure returns (bytes memory) {
        uint256 outLength = (userData.length - 2) / 2;
        bytes memory decoded = new bytes(outLength);
        for (uint256 i = 0; i < outLength; ++i) {
            uint8 high = _fromHexChar(uint8(userData[2 + i * 2]));
            uint8 low = _fromHexChar(uint8(userData[3 + i * 2]));
            if (high == type(uint8).max || low == type(uint8).max) return "";
            decoded[i] = bytes1((high << 4) | low);
        }
        return decoded;
    }

    function _fromHexChar(uint8 charCode) internal pure returns (uint8) {
        if (charCode >= 48 && charCode <= 57) return charCode - 48;
        if (charCode >= 65 && charCode <= 70) return charCode - 55;
        if (charCode >= 97 && charCode <= 102) return charCode - 87;
        return type(uint8).max;
    }

    function _setAttestationPolicy(bytes32 attestationId, bool enabled, bool[3] memory requiredOfac) internal {
        if (attestationId == bytes32(0) || (enabled && !_hasAnyRequiredOfac(requiredOfac))) {
            revert InvalidAttestationPolicy();
        }

        AttestationPolicy storage policy = _attestationPolicies[attestationId];
        policy.enabled = enabled;
        for (uint256 i = 0; i < 3; ++i) {
            policy.requiredOfac[i] = requiredOfac[i];
        }

        emit AttestationPolicyUpdated(attestationId, enabled, requiredOfac);
    }

    function _validateAttestationPolicy(bytes32 attestationId, bool[3] memory ofac) internal view {
        AttestationPolicy memory policy = _attestationPolicies[attestationId];
        if (!policy.enabled) {
            revert UnsupportedDocumentType();
        }
        if (!_hasRequiredSanctionsClearance(policy.requiredOfac, ofac)) {
            revert SanctionsCheckFailed();
        }
    }

    function _hasAnyRequiredOfac(bool[3] memory requiredOfac) internal pure returns (bool) {
        return requiredOfac[0] || requiredOfac[1] || requiredOfac[2];
    }

    function _hasRequiredSanctionsClearance(bool[3] memory requiredOfac, bool[3] memory ofac)
        internal
        pure
        returns (bool)
    {
        for (uint256 i = 0; i < 3; ++i) {
            if (requiredOfac[i] && !ofac[i]) {
                return false;
            }
        }
        return true;
    }
}
