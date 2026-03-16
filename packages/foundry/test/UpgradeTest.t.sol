// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { ProfileRegistry } from "../contracts/ProfileRegistry.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { IProfileRegistry } from "../contracts/interfaces/IProfileRegistry.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { IVoterIdNFT } from "../contracts/interfaces/IVoterIdNFT.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title Legacy ProfileRegistry implementation used to verify storage-safe upgrades
contract ProfileRegistryV1 is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public constant MIN_NAME_LENGTH = 3;
    uint256 public constant MAX_NAME_LENGTH = 20;
    uint256 public constant MAX_IMAGE_URL_LENGTH = 512;

    struct Profile {
        string name;
        string imageUrl;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(address => Profile) private _profiles;
    mapping(bytes32 => address) private _nameToAddress;
    address[] private _registeredAddresses;
    IVoterIdNFT public voterIdNFT;

    uint256[50] private __gap;

    constructor() {
        _disableInitializers();
    }

    function initialize(address _admin, address _governance) public initializer {
        __AccessControl_init();

        require(_admin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(UPGRADER_ROLE, _governance);

        if (_admin != _governance) {
            _grantRole(ADMIN_ROLE, _admin);
        }
    }

    function setProfile(string calldata name, string calldata imageUrl) external {
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
        require(existingOwner == address(0) || existingOwner == msg.sender, "Name already taken");

        Profile storage profile = _profiles[msg.sender];
        bool isNewProfile = profile.createdAt == 0;

        if (!isNewProfile && bytes(profile.name).length > 0) {
            bytes32 oldNameHash = _normalizeAndHash(profile.name);
            if (oldNameHash != nameHash) {
                delete _nameToAddress[oldNameHash];
            }
        }

        profile.name = name;
        profile.imageUrl = imageUrl;
        profile.updatedAt = block.timestamp;

        if (isNewProfile) {
            profile.createdAt = block.timestamp;
            _registeredAddresses.push(msg.sender);
        }

        _nameToAddress[nameHash] = msg.sender;
    }

    function getProfile(address user) external view returns (Profile memory) {
        return _profiles[user];
    }

    function hasProfile(address user) external view returns (bool) {
        return _profiles[user].createdAt > 0;
    }

    function _isValidName(string memory name) internal pure returns (bool) {
        bytes memory nameBytes = bytes(name);
        for (uint256 i = 0; i < nameBytes.length; i++) {
            bytes1 char = nameBytes[i];
            bool isLowercase = (char >= 0x61 && char <= 0x7A);
            bool isUppercase = (char >= 0x41 && char <= 0x5A);
            bool isDigit = (char >= 0x30 && char <= 0x39);
            bool isUnderscore = (char == 0x5F);
            if (!isLowercase && !isUppercase && !isDigit && !isUnderscore) {
                return false;
            }
        }
        return true;
    }

    function _normalizeAndHash(string memory name) internal pure returns (bytes32) {
        bytes memory nameBytes = bytes(name);
        bytes memory lowercased = new bytes(nameBytes.length);
        for (uint256 i = 0; i < nameBytes.length; i++) {
            bytes1 char = nameBytes[i];
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

/// @title Minimal mock for RoundVotingEngine interface (used by FrontendRegistry)
contract MockVotingEngineForUpgrade is IRoundVotingEngine {
    function addToConsensusReserve(uint256) external override { }

    function contentCommitCount(uint256) external pure override returns (uint256) {
        return 0;
    }

    function currentRoundId(uint256) external pure override returns (uint256) {
        return 0;
    }

    function rounds(uint256, uint256)
        external
        pure
        override
        returns (
            uint256,
            RoundLib.RoundState,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (0, RoundLib.RoundState.Open, 0, 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0);
    }

    function transferReward(address, uint256) external override { }
}

/// @title UUPS Upgrade Tests for all upgradeable contracts
contract UpgradeTest is Test {
    // Contracts
    ContentRegistry public contentRegistry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    ProfileRegistry public profileRegistry;
    FrontendRegistry public frontendRegistry;

    CuryoReputation public crepToken;
    MockVotingEngineForUpgrade public mockVotingEngine;

    // Roles
    address public admin = address(1);
    address public governance = address(2);
    address public attacker = address(999);

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    function setUp() public {
        vm.startPrank(admin);

        // Deploy token
        crepToken = new CuryoReputation(admin, governance);
        mockVotingEngine = new MockVotingEngineForUpgrade();

        // --- ContentRegistry ---
        ContentRegistry crImpl = new ContentRegistry();
        contentRegistry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(crImpl), abi.encodeCall(ContentRegistry.initialize, (admin, governance, address(crepToken)))
                )
            )
        );

        // --- RoundVotingEngine ---
        RoundVotingEngine veImpl = new RoundVotingEngine();
        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(veImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize, (admin, governance, address(crepToken), address(contentRegistry))
                    )
                )
            )
        );

        // --- RoundRewardDistributor ---
        RoundRewardDistributor rdImpl = new RoundRewardDistributor();
        rewardDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(rdImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (governance, address(crepToken), address(votingEngine), address(contentRegistry))
                    )
                )
            )
        );

        // --- ProfileRegistry ---
        ProfileRegistry prImpl = new ProfileRegistry();
        profileRegistry = ProfileRegistry(
            address(new ERC1967Proxy(address(prImpl), abi.encodeCall(ProfileRegistry.initialize, (admin, governance))))
        );

        // --- FrontendRegistry ---
        FrontendRegistry frImpl = new FrontendRegistry();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frImpl),
                    abi.encodeCall(FrontendRegistry.initialize, (admin, governance, address(crepToken)))
                )
            )
        );

        vm.stopPrank();
    }

    // =========================================================================
    // ContentRegistry upgrade tests
    // =========================================================================

    function test_ContentRegistry_GovernanceCanUpgrade() public {
        ContentRegistry newImpl = new ContentRegistry();
        vm.prank(governance);
        UUPSUpgradeable(address(contentRegistry)).upgradeToAndCall(address(newImpl), "");
    }

    function test_ContentRegistry_UnauthorizedCannotUpgrade() public {
        ContentRegistry newImpl = new ContentRegistry();
        vm.prank(attacker);
        vm.expectRevert();
        UUPSUpgradeable(address(contentRegistry)).upgradeToAndCall(address(newImpl), "");
    }

    function test_ContentRegistry_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        contentRegistry.initialize(admin, governance, address(crepToken));
    }

    function test_ContentRegistry_StatePreservedAfterUpgrade() public {
        // Verify UPGRADER_ROLE is set on governance
        assertTrue(contentRegistry.hasRole(UPGRADER_ROLE, governance));

        // Upgrade
        ContentRegistry newImpl = new ContentRegistry();
        vm.prank(governance);
        UUPSUpgradeable(address(contentRegistry)).upgradeToAndCall(address(newImpl), "");

        // Verify state preserved
        assertTrue(contentRegistry.hasRole(UPGRADER_ROLE, governance));
        assertEq(address(contentRegistry.crepToken()), address(crepToken));
    }

    // =========================================================================
    // RoundVotingEngine upgrade tests
    // =========================================================================

    function test_VotingEngine_GovernanceCanUpgrade() public {
        RoundVotingEngine newImpl = new RoundVotingEngine();
        vm.prank(governance);
        UUPSUpgradeable(address(votingEngine)).upgradeToAndCall(address(newImpl), "");
    }

    function test_VotingEngine_UnauthorizedCannotUpgrade() public {
        RoundVotingEngine newImpl = new RoundVotingEngine();
        vm.prank(attacker);
        vm.expectRevert();
        UUPSUpgradeable(address(votingEngine)).upgradeToAndCall(address(newImpl), "");
    }

    function test_VotingEngine_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        votingEngine.initialize(admin, governance, address(crepToken), address(contentRegistry));
    }

    function test_VotingEngine_StatePreservedAfterUpgrade() public {
        assertTrue(votingEngine.hasRole(UPGRADER_ROLE, governance));
        assertEq(address(votingEngine.registry()), address(contentRegistry));

        RoundVotingEngine newImpl = new RoundVotingEngine();
        vm.prank(governance);
        UUPSUpgradeable(address(votingEngine)).upgradeToAndCall(address(newImpl), "");

        assertTrue(votingEngine.hasRole(UPGRADER_ROLE, governance));
        assertEq(address(votingEngine.registry()), address(contentRegistry));
    }

    // =========================================================================
    // RoundRewardDistributor upgrade tests
    // =========================================================================

    function test_RewardDistributor_GovernanceCanUpgrade() public {
        RoundRewardDistributor newImpl = new RoundRewardDistributor();
        vm.prank(governance);
        UUPSUpgradeable(address(rewardDistributor)).upgradeToAndCall(address(newImpl), "");
    }

    function test_RewardDistributor_UnauthorizedCannotUpgrade() public {
        RoundRewardDistributor newImpl = new RoundRewardDistributor();
        vm.prank(attacker);
        vm.expectRevert();
        UUPSUpgradeable(address(rewardDistributor)).upgradeToAndCall(address(newImpl), "");
    }

    function test_RewardDistributor_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        rewardDistributor.initialize(governance, address(crepToken), address(votingEngine), address(contentRegistry));
    }

    function test_RewardDistributor_StatePreservedAfterUpgrade() public {
        assertTrue(rewardDistributor.hasRole(UPGRADER_ROLE, governance));
        assertEq(address(rewardDistributor.crepToken()), address(crepToken));

        RoundRewardDistributor newImpl = new RoundRewardDistributor();
        vm.prank(governance);
        UUPSUpgradeable(address(rewardDistributor)).upgradeToAndCall(address(newImpl), "");

        assertTrue(rewardDistributor.hasRole(UPGRADER_ROLE, governance));
        assertEq(address(rewardDistributor.crepToken()), address(crepToken));
    }

    // =========================================================================
    // ProfileRegistry upgrade tests
    // =========================================================================

    function test_ProfileRegistry_GovernanceCanUpgrade() public {
        ProfileRegistry newImpl = new ProfileRegistry();
        vm.prank(governance);
        UUPSUpgradeable(address(profileRegistry)).upgradeToAndCall(address(newImpl), "");
    }

    function test_ProfileRegistry_UnauthorizedCannotUpgrade() public {
        ProfileRegistry newImpl = new ProfileRegistry();
        vm.prank(attacker);
        vm.expectRevert();
        UUPSUpgradeable(address(profileRegistry)).upgradeToAndCall(address(newImpl), "");
    }

    function test_ProfileRegistry_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        profileRegistry.initialize(admin, governance);
    }

    function test_ProfileRegistry_StatePreservedAfterUpgrade() public {
        // Create a profile before upgrade
        vm.prank(address(10));
        profileRegistry.setProfile("testuser", "https://example.com/img.png", "");

        assertTrue(profileRegistry.hasRole(UPGRADER_ROLE, governance));
        assertTrue(profileRegistry.hasProfile(address(10)));

        ProfileRegistry newImpl = new ProfileRegistry();
        vm.prank(governance);
        UUPSUpgradeable(address(profileRegistry)).upgradeToAndCall(address(newImpl), "");

        // State preserved
        assertTrue(profileRegistry.hasRole(UPGRADER_ROLE, governance));
        assertTrue(profileRegistry.hasProfile(address(10)));

        IProfileRegistry.Profile memory profile = profileRegistry.getProfile(address(10));
        assertEq(profile.name, "testuser");
        assertEq(profile.imageUrl, "https://example.com/img.png");
        assertEq(profile.strategy, "");
        assertTrue(profile.createdAt > 0);
        assertTrue(profile.updatedAt > 0);
    }

    function test_ProfileRegistry_UpgradeFromLegacyLayoutPreservesExistingProfiles() public {
        vm.startPrank(admin);
        ProfileRegistryV1 legacyImpl = new ProfileRegistryV1();
        ProfileRegistryV1 legacyProfileRegistry = ProfileRegistryV1(
            address(new ERC1967Proxy(address(legacyImpl), abi.encodeCall(ProfileRegistryV1.initialize, (admin, governance))))
        );
        vm.stopPrank();

        address user = address(0xBEEF);
        vm.prank(user);
        legacyProfileRegistry.setProfile("legacyuser", "https://example.com/legacy.png");

        ProfileRegistryV1.Profile memory oldProfile = legacyProfileRegistry.getProfile(user);
        assertEq(oldProfile.name, "legacyuser");
        assertEq(oldProfile.imageUrl, "https://example.com/legacy.png");
        assertTrue(oldProfile.createdAt > 0);
        assertEq(oldProfile.updatedAt, oldProfile.createdAt);

        ProfileRegistry newImpl = new ProfileRegistry();
        vm.prank(governance);
        UUPSUpgradeable(address(legacyProfileRegistry)).upgradeToAndCall(address(newImpl), "");

        ProfileRegistry upgradedRegistry = ProfileRegistry(address(legacyProfileRegistry));
        IProfileRegistry.Profile memory upgradedProfile = upgradedRegistry.getProfile(user);
        assertEq(upgradedProfile.name, oldProfile.name);
        assertEq(upgradedProfile.imageUrl, oldProfile.imageUrl);
        assertEq(upgradedProfile.strategy, "");
        assertEq(upgradedProfile.createdAt, oldProfile.createdAt);
        assertEq(upgradedProfile.updatedAt, oldProfile.updatedAt);

        vm.prank(user);
        upgradedRegistry.setProfile("legacyuser", "https://example.com/legacy-2.png", "I reward original, useful work.");

        IProfileRegistry.Profile memory migratedProfile = upgradedRegistry.getProfile(user);
        assertEq(migratedProfile.name, "legacyuser");
        assertEq(migratedProfile.imageUrl, "https://example.com/legacy-2.png");
        assertEq(migratedProfile.strategy, "I reward original, useful work.");
        assertEq(migratedProfile.createdAt, oldProfile.createdAt);
        assertTrue(migratedProfile.updatedAt >= oldProfile.updatedAt);
    }

    // =========================================================================
    // FrontendRegistry upgrade tests
    // =========================================================================

    function test_FrontendRegistry_GovernanceCanUpgrade() public {
        FrontendRegistry newImpl = new FrontendRegistry();
        vm.prank(governance);
        UUPSUpgradeable(address(frontendRegistry)).upgradeToAndCall(address(newImpl), "");
    }

    function test_FrontendRegistry_UnauthorizedCannotUpgrade() public {
        FrontendRegistry newImpl = new FrontendRegistry();
        vm.prank(attacker);
        vm.expectRevert();
        UUPSUpgradeable(address(frontendRegistry)).upgradeToAndCall(address(newImpl), "");
    }

    function test_FrontendRegistry_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        frontendRegistry.initialize(admin, governance, address(crepToken));
    }

    function test_FrontendRegistry_StatePreservedAfterUpgrade() public {
        assertTrue(frontendRegistry.hasRole(UPGRADER_ROLE, governance));
        assertEq(frontendRegistry.STAKE_AMOUNT(), 1000e6);

        FrontendRegistry newImpl = new FrontendRegistry();
        vm.prank(governance);
        UUPSUpgradeable(address(frontendRegistry)).upgradeToAndCall(address(newImpl), "");

        assertTrue(frontendRegistry.hasRole(UPGRADER_ROLE, governance));
        assertEq(frontendRegistry.STAKE_AMOUNT(), 1000e6);
    }

    // =========================================================================
    // Implementation direct initialization protection
    // =========================================================================

    function test_ImplementationsCannotBeInitializedDirectly() public {
        // Each implementation should have _disableInitializers() in its constructor
        ContentRegistry crImpl = new ContentRegistry();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        crImpl.initialize(admin, governance, address(crepToken));

        RoundVotingEngine veImpl = new RoundVotingEngine();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        veImpl.initialize(admin, governance, address(crepToken), address(contentRegistry));

        RoundRewardDistributor rdImpl = new RoundRewardDistributor();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        rdImpl.initialize(governance, address(crepToken), address(votingEngine), address(contentRegistry));

        ProfileRegistry prImpl = new ProfileRegistry();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        prImpl.initialize(admin, governance);

        FrontendRegistry frImpl = new FrontendRegistry();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        frImpl.initialize(admin, governance, address(crepToken));
    }
}
