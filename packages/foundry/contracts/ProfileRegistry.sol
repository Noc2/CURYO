// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";

/// @title ProfileRegistry
/// @notice Manages on-chain user profiles with unique names and profile images
/// @dev Users can set their profile name (unique) and image URL. No stake required.
contract ProfileRegistry is IProfileRegistry, Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // --- Constants ---
    uint256 public constant MIN_NAME_LENGTH = 3;
    uint256 public constant MAX_NAME_LENGTH = 20;
    uint256 public constant MAX_IMAGE_URL_LENGTH = 512;

    // --- State ---
    mapping(address => Profile) private _profiles;
    mapping(bytes32 => address) private _nameToAddress; // lowercase name hash => owner
    address[] private _registeredAddresses;
    IVoterIdNFT public voterIdNFT; // Voter ID NFT for sybil resistance

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // --- Events ---
    event ProfileCreated(address indexed user, string name);
    event ProfileUpdated(address indexed user, string name, string imageUrl);
    event VoterIdNFTUpdated(address voterIdNFT);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the profile registry contract.
    /// @param _admin Address with temporary admin role for initial wiring.
    /// @param _governance Address with permanent governance roles (timelock).
    function initialize(address _admin, address _governance) public initializer {
        __AccessControl_init();

        require(_admin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");

        // Governance gets all permanent roles
        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(UPGRADER_ROLE, _governance);

        // Admin gets only ADMIN_ROLE for initial cross-contract wiring
        if (_admin != _governance) {
            _grantRole(ADMIN_ROLE, _admin);
        }
    }

    // --- Admin Functions ---

    /// @notice Set the Voter ID NFT contract for sybil resistance
    /// @param _voterIdNFT The Voter ID NFT contract address
    function setVoterIdNFT(address _voterIdNFT) external onlyRole(ADMIN_ROLE) {
        require(_voterIdNFT != address(0), "Invalid address");
        voterIdNFT = IVoterIdNFT(_voterIdNFT);
        emit VoterIdNFTUpdated(_voterIdNFT);
    }

    // --- Public Functions ---

    /// @inheritdoc IProfileRegistry
    function setProfile(string calldata name, string calldata imageUrl) external override {
        // Require Voter ID if VoterIdNFT is configured
        if (address(voterIdNFT) != address(0)) {
            require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
            require(voterIdNFT.resolveHolder(msg.sender) == msg.sender, "Profile owner must hold Voter ID");
        }

        require(bytes(name).length >= MIN_NAME_LENGTH, "Name too short");
        require(bytes(name).length <= MAX_NAME_LENGTH, "Name too long");
        require(bytes(imageUrl).length <= MAX_IMAGE_URL_LENGTH, "Image URL too long");
        require(_isValidName(name), "Invalid name format");

        bytes32 nameHash = _normalizeAndHash(name);
        address existingOwner = _nameToAddress[nameHash];

        // Check uniqueness (allow if same user is updating)
        require(existingOwner == address(0) || existingOwner == msg.sender, "Name already taken");

        Profile storage profile = _profiles[msg.sender];
        bool isNewProfile = profile.createdAt == 0;

        // If user had a different name before, release it
        if (!isNewProfile && bytes(profile.name).length > 0) {
            bytes32 oldNameHash = _normalizeAndHash(profile.name);
            if (oldNameHash != nameHash) {
                delete _nameToAddress[oldNameHash];
            }
        }

        // Update or create profile
        profile.name = name;
        profile.imageUrl = imageUrl;
        profile.updatedAt = block.timestamp;

        if (isNewProfile) {
            profile.createdAt = block.timestamp;
            _registeredAddresses.push(msg.sender);
            emit ProfileCreated(msg.sender, name);
        } else {
            emit ProfileUpdated(msg.sender, name, imageUrl);
        }

        // Register name ownership
        _nameToAddress[nameHash] = msg.sender;
    }

    // --- View Functions ---

    /// @inheritdoc IProfileRegistry
    function getProfile(address user) external view override returns (Profile memory) {
        return _profiles[user];
    }

    /// @inheritdoc IProfileRegistry
    function isNameTaken(string calldata name) external view override returns (bool) {
        if (bytes(name).length < MIN_NAME_LENGTH) return false;
        bytes32 nameHash = _normalizeAndHash(name);
        return _nameToAddress[nameHash] != address(0);
    }

    /// @inheritdoc IProfileRegistry
    function hasProfile(address user) external view override returns (bool) {
        return _profiles[user].createdAt > 0;
    }

    /// @inheritdoc IProfileRegistry
    function getAddressByName(string calldata name) external view override returns (address) {
        bytes32 nameHash = _normalizeAndHash(name);
        return _nameToAddress[nameHash];
    }

    /// @notice Get total number of registered profiles
    function getProfileCount() external view returns (uint256) {
        return _registeredAddresses.length;
    }

    /// @notice Get all registered addresses (for enumeration)
    function getRegisteredAddresses() external view returns (address[] memory) {
        return _registeredAddresses;
    }

    /// @notice Get registered addresses with pagination
    /// @param offset The starting index
    /// @param limit The maximum number of addresses to return
    /// @return addresses The paginated array of registered addresses
    /// @return total The total number of registered addresses
    function getRegisteredAddressesPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory addresses, uint256 total)
    {
        total = _registeredAddresses.length;
        if (offset >= total || limit == 0) {
            return (new address[](0), total);
        }
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLength = end - offset;
        addresses = new address[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            addresses[i] = _registeredAddresses[offset + i];
        }
    }

    // --- Internal Functions ---

    /// @notice Validate name format (alphanumeric and underscore only)
    function _isValidName(string memory name) internal pure returns (bool) {
        bytes memory nameBytes = bytes(name);
        for (uint256 i = 0; i < nameBytes.length; i++) {
            bytes1 char = nameBytes[i];
            bool isLowercase = (char >= 0x61 && char <= 0x7A); // a-z
            bool isUppercase = (char >= 0x41 && char <= 0x5A); // A-Z
            bool isDigit = (char >= 0x30 && char <= 0x39); // 0-9
            bool isUnderscore = (char == 0x5F); // _
            if (!isLowercase && !isUppercase && !isDigit && !isUnderscore) {
                return false;
            }
        }
        return true;
    }

    /// @notice Normalize name to lowercase and hash for comparison
    function _normalizeAndHash(string memory name) internal pure returns (bytes32) {
        bytes memory nameBytes = bytes(name);
        bytes memory lowercased = new bytes(nameBytes.length);
        for (uint256 i = 0; i < nameBytes.length; i++) {
            bytes1 char = nameBytes[i];
            // Convert uppercase to lowercase
            if (char >= 0x41 && char <= 0x5A) {
                lowercased[i] = bytes1(uint8(char) + 32);
            } else {
                lowercased[i] = char;
            }
        }
        return keccak256(lowercased);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }
}
