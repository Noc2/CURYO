// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";

/// @title VoterIdNFT
/// @notice Soulbound (non-transferable) ERC721 NFT representing a verified human identity
/// @dev Minted by HumanFaucet upon successful Self.xyz verification. Token ID 0 is reserved (indicates no Voter ID).
contract VoterIdNFT is ERC721, Ownable, IVoterIdNFT {
    // ====================================================
    // Constants
    // ====================================================

    /// @notice Maximum stake per Voter ID per content per epoch (100 cREP with 6 decimals)
    uint256 public constant MAX_STAKE_PER_VOTER = 100e6;

    /// @notice Maximum supply of Voter IDs (defense-in-depth against compromised identity provider)
    uint256 public constant MAX_SUPPLY = 10_000_000;

    // ====================================================
    // Storage Variables
    // ====================================================

    /// @notice Counter for token IDs (starts at 1, 0 means no Voter ID)
    uint256 private _tokenIdCounter;

    /// @notice Mapping from token ID to holder address
    mapping(uint256 => address) public tokenIdToHolder;

    /// @notice Mapping from holder address to token ID (0 if no Voter ID)
    mapping(address => uint256) public holderToTokenId;

    /// @notice Mapping to track used nullifiers (prevents double minting)
    mapping(uint256 => bool) public nullifierUsed;

    /// @notice Stake tracking per Voter ID: contentId => epochId => tokenId => stakedAmount
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint256))) private _epochContentStake;

    /// @notice Authorized minters (e.g., HumanFaucet, WorldIdFaucet)
    mapping(address => bool) public authorizedMinters;

    /// @notice Authorized stake recorder (RoundVotingEngine)
    address public stakeRecorder;

    /// @notice Mapping from holder address to their delegate address (address(0) if none)
    mapping(address => address) public delegateTo;

    /// @notice Mapping from delegate address to the holder they represent (address(0) if none)
    mapping(address => address) public delegateOf;

    // ====================================================
    // Events
    // ====================================================

    event VoterIdMinted(uint256 indexed tokenId, address indexed holder, uint256 indexed nullifier);
    event VoterIdRevoked(uint256 indexed tokenId, address indexed holder);
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event StakeRecorderSet(address indexed stakeRecorder);
    event StakeRecorded(uint256 indexed contentId, uint256 indexed epochId, uint256 indexed tokenId, uint256 amount);
    event DelegateSet(address indexed holder, address indexed delegate);
    event DelegateRemoved(address indexed holder, address indexed previousDelegate);
    event GovernanceUpdated(address indexed governance);
    event NullifierReset(uint256 indexed nullifier);

    // ====================================================
    // Errors
    // ====================================================

    error OnlyMinter();
    error OnlyStakeRecorder();
    error NullifierAlreadyUsed();
    error AlreadyHasVoterId();
    error InvalidAddress();
    error TransferNotAllowed();
    error ApprovalNotAllowed();
    error DelegateIsHolder();
    error DelegateAlreadyAssigned();
    error NoDelegateSet();
    error CannotDelegateSelf();
    error CallerNotHolder();
    error CallerIsDelegate();
    error MaxSupplyReached();

    // ====================================================
    // Constructor
    // ====================================================

    /// @notice The governance address (timelock) — ownership can only be transferred here
    address public governance;

    /// @notice Constructor for the VoterIdNFT contract
    /// @param _owner The initial contract owner (deployer, for setup)
    /// @param _governance The governance address (timelock) — transferOwnership restricted to this
    constructor(address _owner, address _governance) ERC721("Curyo Voter ID", "CVID") Ownable(_owner) {
        if (_governance == address(0)) revert InvalidAddress();
        governance = _governance;
        // Token ID 0 is reserved to indicate "no Voter ID"
        _tokenIdCounter = 1;
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

    // ====================================================
    // Admin Functions
    // ====================================================

    /// @notice Add an authorized minter (e.g., HumanFaucet)
    /// @param _minter The minter address to authorize
    function addMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert InvalidAddress();
        authorizedMinters[_minter] = true;
        emit MinterAdded(_minter);
    }

    /// @notice Update the governance address that ownership can migrate to.
    /// @dev Lets the current governance timelock retarget ownership before a governance migration.
    function setGovernance(address _governance) external onlyOwner {
        if (_governance == address(0)) revert InvalidAddress();
        governance = _governance;
        emit GovernanceUpdated(_governance);
    }

    /// @notice Remove an authorized minter
    /// @param _minter The minter address to deauthorize
    function removeMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert InvalidAddress();
        authorizedMinters[_minter] = false;
        emit MinterRemoved(_minter);
    }

    /// @notice Set the authorized stake recorder (RoundVotingEngine)
    /// @param _stakeRecorder The stake recorder address
    function setStakeRecorder(address _stakeRecorder) external onlyOwner {
        if (_stakeRecorder == address(0)) revert InvalidAddress();
        stakeRecorder = _stakeRecorder;
        emit StakeRecorderSet(_stakeRecorder);
    }

    // ====================================================
    // Governance Functions
    // ====================================================

    /// @notice Revoke a Voter ID (governance action for collusion enforcement)
    /// @dev Only callable by owner (governance timelock). Burns the NFT and clears mappings.
    /// @param holder The address whose Voter ID should be revoked
    function revokeVoterId(address holder) external onlyOwner {
        uint256 tokenId = holderToTokenId[holder];
        require(tokenId != 0, "No Voter ID");

        // Clear delegation if any
        address delegate = delegateTo[holder];
        if (delegate != address(0)) {
            delete delegateOf[delegate];
            delete delegateTo[holder];
            emit DelegateRemoved(holder, delegate);
        }

        // Clear bidirectional mappings
        delete holderToTokenId[holder];
        delete tokenIdToHolder[tokenId];

        // Burn the NFT (calls _update with to=address(0))
        _burn(tokenId);

        emit VoterIdRevoked(tokenId, holder);
    }

    /// @notice Reset a nullifier to allow re-verification after revocation.
    /// @param nullifier The nullifier to reset
    function resetNullifier(uint256 nullifier) external onlyOwner {
        nullifierUsed[nullifier] = false;
        emit NullifierReset(nullifier);
    }

    // ====================================================
    // Minting (IVoterIdNFT)
    // ====================================================

    /// @notice Mint a new Voter ID NFT
    /// @dev Supply is bounded by unique passport nullifiers from Self.xyz (one per real human)
    ///      plus an on-chain MAX_SUPPLY cap (10M) as defense-in-depth.
    /// @param to The address to mint to
    /// @param nullifier The passport nullifier from Self.xyz
    /// @return tokenId The minted token ID
    function mint(address to, uint256 nullifier) external override returns (uint256 tokenId) {
        if (!authorizedMinters[msg.sender]) revert OnlyMinter();
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed();
        if (holderToTokenId[to] != 0) revert AlreadyHasVoterId();
        if (delegateOf[to] != address(0)) revert DelegateAlreadyAssigned();

        tokenId = _tokenIdCounter++;
        if (tokenId > MAX_SUPPLY) revert MaxSupplyReached();

        // Mark nullifier as used
        nullifierUsed[nullifier] = true;

        // Update bidirectional mappings
        holderToTokenId[to] = tokenId;
        tokenIdToHolder[tokenId] = to;

        // Safe minting prevents Voter IDs from being trapped in contracts that cannot receive ERC721 tokens.
        _safeMint(to, tokenId);

        emit VoterIdMinted(tokenId, to, nullifier);
    }

    // ====================================================
    // Query Functions (IVoterIdNFT)
    // ====================================================

    /// @notice Check if an address has a Voter ID (or is a delegate for one)
    /// @param holder The address to check
    /// @return True if the address owns a Voter ID or is an active delegate
    function hasVoterId(address holder) external view override returns (bool) {
        if (holderToTokenId[holder] != 0) return true;
        address delegator = delegateOf[holder];
        return delegator != address(0) && holderToTokenId[delegator] != 0;
    }

    /// @notice Get the token ID for an address (resolves delegates)
    /// @param holder The address to query
    /// @return The token ID (0 if no Voter ID and not a delegate)
    function getTokenId(address holder) external view override returns (uint256) {
        uint256 tokenId = holderToTokenId[holder];
        if (tokenId != 0) return tokenId;
        address delegator = delegateOf[holder];
        if (delegator != address(0)) return holderToTokenId[delegator];
        return 0;
    }

    /// @notice Get the address holding a token ID
    /// @param tokenId The token ID to query
    /// @return The holder address
    function getHolder(uint256 tokenId) external view override returns (address) {
        return tokenIdToHolder[tokenId];
    }

    /// @notice Check if a nullifier has already been used
    /// @param nullifier The nullifier to check
    /// @return True if the nullifier has been used
    function isNullifierUsed(uint256 nullifier) external view override returns (bool) {
        return nullifierUsed[nullifier];
    }

    // ====================================================
    // Stake Tracking (IVoterIdNFT)
    // ====================================================

    /// @notice Record stake for a Voter ID on specific content in an epoch
    /// @param contentId The content being voted on
    /// @param epochId The epoch ID
    /// @param tokenId The Voter ID token
    /// @param amount The stake amount to add
    function recordStake(uint256 contentId, uint256 epochId, uint256 tokenId, uint256 amount) external override {
        if (msg.sender != stakeRecorder) revert OnlyStakeRecorder();
        require(tokenIdToHolder[tokenId] != address(0), "Token not active"); // L-10: defense-in-depth

        _epochContentStake[contentId][epochId][tokenId] += amount;

        emit StakeRecorded(contentId, epochId, tokenId, amount);
    }

    /// @notice Get the total staked amount for a Voter ID on specific content in an epoch
    /// @param contentId The content ID
    /// @param epochId The epoch ID
    /// @param tokenId The Voter ID token
    /// @return The total staked amount
    function getEpochContentStake(uint256 contentId, uint256 epochId, uint256 tokenId)
        external
        view
        override
        returns (uint256)
    {
        return _epochContentStake[contentId][epochId][tokenId];
    }

    /// @notice Get remaining stake capacity for a Voter ID on specific content in an epoch
    /// @param contentId The content ID
    /// @param epochId The epoch ID
    /// @param tokenId The Voter ID token
    /// @return The remaining stake capacity
    function getRemainingStakeCapacity(uint256 contentId, uint256 epochId, uint256 tokenId)
        external
        view
        returns (uint256)
    {
        uint256 currentStake = _epochContentStake[contentId][epochId][tokenId];
        if (currentStake >= MAX_STAKE_PER_VOTER) return 0;
        return MAX_STAKE_PER_VOTER - currentStake;
    }

    // ====================================================
    // Delegation Functions
    // ====================================================

    /// @notice Authorize a delegate address to act on behalf of the caller's Voter ID
    /// @dev Only the SBT holder can set a delegate. Replaces any existing delegate.
    ///      The delegate can then pass hasVoterId() and getTokenId() checks transparently.
    ///      AUDIT NOTE (H-2): A holder who is also acting as a delegate for someone else cannot
    ///      set their own delegate. This prevents identity chaining (A→B→C) that could obscure
    ///      the true number of unique identities behind a set of addresses.
    /// @param delegate The address to authorize as delegate
    function setDelegate(address delegate) external {
        if (delegate == address(0)) revert InvalidAddress();
        if (delegate == msg.sender) revert CannotDelegateSelf();
        if (holderToTokenId[msg.sender] == 0) revert CallerNotHolder();
        // H-2 audit fix: prevent a holder who is also a delegate from delegating (no identity chaining)
        if (delegateOf[msg.sender] != address(0)) revert CallerIsDelegate();
        if (holderToTokenId[delegate] != 0) revert DelegateIsHolder();
        if (delegateOf[delegate] != address(0)) revert DelegateAlreadyAssigned();
        // Prevent delegating to an address that has delegated out to someone else
        if (delegateTo[delegate] != address(0)) revert DelegateAlreadyAssigned();

        // Remove existing delegate if any
        address oldDelegate = delegateTo[msg.sender];
        if (oldDelegate != address(0)) {
            delete delegateOf[oldDelegate];
            emit DelegateRemoved(msg.sender, oldDelegate);
        }

        // Set new delegate
        delegateTo[msg.sender] = delegate;
        delegateOf[delegate] = msg.sender;

        emit DelegateSet(msg.sender, delegate);
    }

    /// @notice Remove the current delegate authorization
    function removeDelegate() external {
        address oldDelegate = delegateTo[msg.sender];
        if (oldDelegate == address(0)) revert NoDelegateSet();

        delete delegateTo[msg.sender];
        delete delegateOf[oldDelegate];

        emit DelegateRemoved(msg.sender, oldDelegate);
    }

    /// @notice Resolve an address to the effective SBT holder
    /// @dev Returns the address itself if it's a holder, or the delegating holder if it's a delegate
    /// @param addr The address to resolve
    /// @return The effective holder address (address(0) if neither holder nor delegate)
    function resolveHolder(address addr) external view returns (address) {
        if (holderToTokenId[addr] != 0) return addr;
        return delegateOf[addr];
    }

    // ====================================================
    // Soulbound Overrides
    // ====================================================

    /// @notice Override _update to make token soulbound (non-transferable)
    /// @dev Allows minting (from == address(0)) and burning (to == address(0)), blocks transfers
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            revert TransferNotAllowed();
        }

        return super._update(to, tokenId, auth);
    }

    /// @notice Override approve to prevent approvals (soulbound)
    function approve(address, uint256) public pure override {
        revert ApprovalNotAllowed();
    }

    /// @notice Override setApprovalForAll to prevent approvals (soulbound)
    function setApprovalForAll(address, bool) public pure override {
        revert ApprovalNotAllowed();
    }

    // ====================================================
    // Metadata
    // ====================================================

    /// @notice Returns the token URI for a given token ID
    /// @param tokenId The token ID
    /// @return The token URI
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        // Return a simple on-chain metadata URI
        // In production, this could point to IPFS or a metadata server
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                _base64Encode(
                    bytes(
                        string(
                            abi.encodePacked(
                                '{"name":"Curyo Voter ID #',
                                _toString(tokenId),
                                '","description":"Soulbound Voter ID for verified humans on Curyo. This token cannot be transferred.","image":"data:image/svg+xml;base64,',
                                _base64Encode(bytes(_generateSVG(tokenId))),
                                '"}'
                            )
                        )
                    )
                )
            )
        );
    }

    /// @notice Generate a simple SVG for the token
    function _generateSVG(uint256 tokenId) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="#1a0d2e"/>',
                '<circle cx="200" cy="150" r="60" fill="#7c3aed"/>',
                '<text x="200" y="260" font-family="Arial" font-size="24" fill="white" text-anchor="middle">VOTER ID</text>',
                '<text x="200" y="300" font-family="Arial" font-size="36" fill="#f97316" text-anchor="middle">#',
                _toString(tokenId),
                "</text>",
                '<text x="200" y="350" font-family="Arial" font-size="14" fill="#666" text-anchor="middle">Verified Human</text>',
                "</svg>"
            )
        );
    }

    /// @notice Convert uint to string
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    /// @notice Base64 encode bytes
    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        string memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        if (data.length == 0) return "";

        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i;
        uint256 j;

        for (i = 0; i < data.length; i += 3) {
            uint256 a = uint8(data[i]);
            uint256 b = i + 1 < data.length ? uint8(data[i + 1]) : 0;
            uint256 c = i + 2 < data.length ? uint8(data[i + 2]) : 0;

            uint256 triple = (a << 16) | (b << 8) | c;

            result[j++] = bytes(TABLE)[triple >> 18 & 0x3F];
            result[j++] = bytes(TABLE)[triple >> 12 & 0x3F];
            result[j++] = i + 1 < data.length ? bytes(TABLE)[triple >> 6 & 0x3F] : bytes1("=");
            result[j++] = i + 2 < data.length ? bytes(TABLE)[triple & 0x3F] : bytes1("=");
        }

        return string(result);
    }
}
