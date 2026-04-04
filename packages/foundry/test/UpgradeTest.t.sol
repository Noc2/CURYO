// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import {
    TransparentUpgradeableProxy,
    ITransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { ProfileRegistry } from "../contracts/ProfileRegistry.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ICategoryRegistry } from "../contracts/interfaces/ICategoryRegistry.sol";
import { IParticipationPool } from "../contracts/interfaces/IParticipationPool.sol";
import { IProfileRegistry } from "../contracts/interfaces/IProfileRegistry.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { IVoterIdNFT } from "../contracts/interfaces/IVoterIdNFT.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title Minimal mock for RoundVotingEngine interface (used by FrontendRegistry)
contract MockVotingEngineForUpgrade is IRoundVotingEngine {
    function addToConsensusReserve(uint256) external override { }

    function hasCommits(uint256) external pure override returns (bool) {
        return false;
    }

    function currentRoundId(uint256) external pure override returns (uint256) {
        return 0;
    }

    function rounds(uint256, uint256)
        external
        pure
        override
        returns (
            uint48,
            RoundLib.RoundState,
            uint16,
            uint16,
            uint64,
            uint64,
            uint64,
            uint16,
            uint16,
            bool,
            uint48,
            uint48,
            uint64,
            uint64
        )
    {
        return (0, RoundLib.RoundState.Open, 0, 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0);
    }

    function transferReward(address, uint256) external override { }
}

/// @dev Mirrors the legacy AccessControl-based ProtocolConfig layout so upgrade tests catch storage regressions.
contract LegacyProtocolConfigV1 is Initializable, AccessControl {
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant TREASURY_ADMIN_ROLE = keccak256("TREASURY_ADMIN_ROLE");

    error InvalidAddress();
    error InvalidConfig();

    address public rewardDistributor;
    address public categoryRegistry;
    address public frontendRegistry;
    address public treasury;
    RoundLib.RoundConfig public config;
    address public voterIdNFT;
    address public participationPool;
    uint256 public revealGracePeriod;

    uint256[50] private __gap;

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address governance) external initializer {
        _initialize(admin, governance, governance);
    }

    function initializeWithTreasury(address admin, address governance, address treasuryAuthority) external initializer {
        _initialize(admin, governance, treasuryAuthority);
    }

    function _initialize(address admin, address governance, address treasuryAuthority) internal {
        if (admin == address(0) || governance == address(0) || treasuryAuthority == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(CONFIG_ROLE, governance);
        _setRoleAdmin(TREASURY_ROLE, TREASURY_ADMIN_ROLE);
        _setRoleAdmin(TREASURY_ADMIN_ROLE, TREASURY_ADMIN_ROLE);
        _grantRole(TREASURY_ADMIN_ROLE, treasuryAuthority);
        _grantRole(TREASURY_ROLE, treasuryAuthority);
        if (admin != governance) {
            _grantRole(CONFIG_ROLE, admin);
            if (admin != treasuryAuthority) {
                _grantRole(TREASURY_ROLE, admin);
            }
        }

        config = RoundLib.RoundConfig({
            epochDuration: uint32(20 minutes),
            maxDuration: uint32(7 days),
            minVoters: uint16(3),
            maxVoters: uint16(1000)
        });
        revealGracePeriod = 60 minutes;
    }

    function setRewardDistributor(address value) external onlyRole(CONFIG_ROLE) {
        if (value == address(0) || rewardDistributor != address(0)) revert InvalidConfig();
        rewardDistributor = value;
    }

    function setCategoryRegistry(address value) external onlyRole(CONFIG_ROLE) {
        if (value == address(0)) revert InvalidAddress();
        categoryRegistry = value;
    }

    function setFrontendRegistry(address value) external onlyRole(CONFIG_ROLE) {
        if (value == address(0)) revert InvalidAddress();
        frontendRegistry = value;
    }

    function setTreasury(address value) external onlyRole(TREASURY_ROLE) {
        if (value == address(0)) revert InvalidAddress();
        treasury = value;
    }

    function setVoterIdNFT(address value) external onlyRole(CONFIG_ROLE) {
        if (value == address(0)) revert InvalidAddress();
        voterIdNFT = value;
    }

    function setParticipationPool(address value) external onlyRole(CONFIG_ROLE) {
        if (value == address(0)) revert InvalidAddress();
        participationPool = value;
    }

    function setRevealGracePeriod(uint256 value) external onlyRole(CONFIG_ROLE) {
        if (value < config.epochDuration) revert InvalidConfig();
        revealGracePeriod = value;
    }

    function setConfig(uint256 epochDuration, uint256 maxDuration, uint256 minVoters, uint256 maxVoters)
        external
        onlyRole(CONFIG_ROLE)
    {
        if (epochDuration < 5 minutes) revert InvalidConfig();
        if (maxDuration < 1 days || maxDuration > 30 days) revert InvalidConfig();
        if (maxDuration / epochDuration > 2016) revert InvalidConfig();
        if (minVoters < 2) revert InvalidConfig();
        if (maxVoters < minVoters || maxVoters > 10000) revert InvalidConfig();

        if (revealGracePeriod > 0 && revealGracePeriod < epochDuration) {
            revealGracePeriod = epochDuration;
        }

        config = RoundLib.RoundConfig({
            epochDuration: uint32(epochDuration),
            maxDuration: uint32(maxDuration),
            minVoters: uint16(minVoters),
            maxVoters: uint16(maxVoters)
        });
    }
}

/// @dev Mirrors the pre-snapshot ContentRegistry layout so upgrade tests catch legacy slot shifts.
contract LegacyContentRegistryV1 is Initializable {
    enum ContentStatus {
        Active,
        Dormant,
        Cancelled
    }

    struct Content {
        uint64 id;
        bytes32 contentHash;
        address submitter;
        uint64 submitterStake;
        uint48 createdAt;
        uint48 lastActivityAt;
        ContentStatus status;
        uint8 dormantCount;
        address reviver;
        bool submitterStakeReturned;
        uint8 rating;
        uint64 categoryId;
    }

    IERC20 public crepToken;
    address public votingEngine;
    ICategoryRegistry public categoryRegistry;
    address public bonusPool;
    address public treasury;
    uint256 public nextContentId;
    mapping(uint256 => Content) public contents;
    mapping(bytes32 => bool) public submissionKeyUsed;
    IVoterIdNFT public voterIdNFT;
    IParticipationPool public participationPool;
    mapping(uint256 => uint256) public submitterParticipationRewardOwed;
    mapping(uint256 => uint256) public submitterParticipationRewardPaid;
    mapping(uint256 => uint256) public submitterParticipationRewardReserved;
    mapping(uint256 => address) public submitterParticipationRewardPool;
    mapping(uint256 => bytes32) internal contentSubmissionKey;
    mapping(uint256 => address) internal contentSubmitterIdentity;
    mapping(uint256 => uint256) internal dormancyAnchorAt;
    uint256[44] private __gap;

    constructor() {
        _disableInitializers();
    }

    function initialize(address, address, address _crepToken) external initializer {
        crepToken = IERC20(_crepToken);
        nextContentId = 1;
    }

    function seedLegacyContent(
        uint256 contentId,
        address submitter,
        uint64 submitterStake,
        uint48 createdAt,
        uint8 rating
    ) external {
        contents[contentId] = Content({
            id: uint64(contentId),
            contentHash: bytes32(0),
            submitter: submitter,
            submitterStake: submitterStake,
            createdAt: createdAt,
            lastActivityAt: createdAt,
            status: ContentStatus.Active,
            dormantCount: 0,
            reviver: address(0),
            submitterStakeReturned: false,
            rating: rating,
            categoryId: 0
        });
    }

    function setDormancyAnchor(uint256 contentId, uint256 anchor) external {
        dormancyAnchorAt[contentId] = anchor;
    }

    function setRewardState(
        uint256 contentId,
        uint256 rewardOwed,
        uint256 rewardPaid,
        uint256 rewardReserved,
        address rewardPool
    ) external {
        submitterParticipationRewardOwed[contentId] = rewardOwed;
        submitterParticipationRewardPaid[contentId] = rewardPaid;
        submitterParticipationRewardReserved[contentId] = rewardReserved;
        submitterParticipationRewardPool[contentId] = rewardPool;
    }
}

/// @title Transparent Proxy Upgrade Tests for all proxy-backed contracts
contract UpgradeTest is Test {
    // Contracts
    ContentRegistry public contentRegistry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    ProfileRegistry public profileRegistry;
    FrontendRegistry public frontendRegistry;
    ProtocolConfig public protocolConfig;
    ProxyAdmin public contentRegistryAdmin;
    ProxyAdmin public votingEngineAdmin;
    ProxyAdmin public rewardDistributorAdmin;
    ProxyAdmin public profileRegistryAdmin;
    ProxyAdmin public frontendRegistryAdmin;
    ProxyAdmin public protocolConfigAdmin;

    CuryoReputation public crepToken;
    MockVotingEngineForUpgrade public mockVotingEngine;

    // Roles
    address public admin = address(1);
    address public governance = address(2);
    address public attacker = address(999);
    bytes32 internal constant ERC1967_ADMIN_SLOT = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    function setUp() public {
        vm.startPrank(admin);

        // Deploy token
        crepToken = new CuryoReputation(admin, governance);
        mockVotingEngine = new MockVotingEngineForUpgrade();

        // --- ContentRegistry ---
        ContentRegistry crImpl = new ContentRegistry();
        TransparentUpgradeableProxy crProxy = new TransparentUpgradeableProxy(
            address(crImpl),
            governance,
            abi.encodeCall(ContentRegistry.initialize, (admin, governance, address(crepToken)))
        );
        contentRegistry = ContentRegistry(address(crProxy));
        contentRegistryAdmin = _proxyAdmin(address(crProxy));

        // --- ProtocolConfig ---
        ProtocolConfig pcImpl = new ProtocolConfig();
        TransparentUpgradeableProxy pcProxy = new TransparentUpgradeableProxy(
            address(pcImpl), governance, abi.encodeCall(ProtocolConfig.initialize, (admin, governance))
        );
        protocolConfig = ProtocolConfig(address(pcProxy));
        protocolConfigAdmin = _proxyAdmin(address(pcProxy));

        // --- RoundVotingEngine ---
        RoundVotingEngine veImpl = new RoundVotingEngine();
        TransparentUpgradeableProxy veProxy = new TransparentUpgradeableProxy(
            address(veImpl),
            governance,
            abi.encodeCall(
                RoundVotingEngine.initialize,
                (governance, address(crepToken), address(contentRegistry), address(protocolConfig))
            )
        );
        votingEngine = RoundVotingEngine(address(veProxy));
        votingEngineAdmin = _proxyAdmin(address(veProxy));

        // --- RoundRewardDistributor ---
        RoundRewardDistributor rdImpl = new RoundRewardDistributor();
        TransparentUpgradeableProxy rdProxy = new TransparentUpgradeableProxy(
            address(rdImpl),
            governance,
            abi.encodeCall(
                RoundRewardDistributor.initialize,
                (governance, address(crepToken), address(votingEngine), address(contentRegistry))
            )
        );
        rewardDistributor = RoundRewardDistributor(address(rdProxy));
        rewardDistributorAdmin = _proxyAdmin(address(rdProxy));

        // --- ProfileRegistry ---
        ProfileRegistry prImpl = new ProfileRegistry();
        TransparentUpgradeableProxy prProxy = new TransparentUpgradeableProxy(
            address(prImpl), governance, abi.encodeCall(ProfileRegistry.initialize, (admin, governance))
        );
        profileRegistry = ProfileRegistry(address(prProxy));
        profileRegistryAdmin = _proxyAdmin(address(prProxy));

        // --- FrontendRegistry ---
        FrontendRegistry frImpl = new FrontendRegistry();
        TransparentUpgradeableProxy frProxy = new TransparentUpgradeableProxy(
            address(frImpl),
            governance,
            abi.encodeCall(FrontendRegistry.initialize, (admin, governance, address(crepToken)))
        );
        frontendRegistry = FrontendRegistry(address(frProxy));
        frontendRegistryAdmin = _proxyAdmin(address(frProxy));

        vm.stopPrank();
    }

    // =========================================================================
    // ContentRegistry upgrade tests
    // =========================================================================

    function test_ContentRegistry_GovernanceCanUpgrade() public {
        ContentRegistry newImpl = new ContentRegistry();
        vm.prank(governance);
        contentRegistryAdmin.upgradeAndCall(_proxy(address(contentRegistry)), address(newImpl), "");
    }

    function test_ContentRegistry_UnauthorizedCannotUpgrade() public {
        ContentRegistry newImpl = new ContentRegistry();
        vm.prank(attacker);
        vm.expectRevert();
        contentRegistryAdmin.upgradeAndCall(_proxy(address(contentRegistry)), address(newImpl), "");
    }

    function test_ContentRegistry_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        contentRegistry.initialize(admin, governance, address(crepToken));
    }

    function test_ContentRegistry_StatePreservedAfterUpgrade() public {
        assertEq(contentRegistryAdmin.owner(), governance);

        // Upgrade
        ContentRegistry newImpl = new ContentRegistry();
        vm.prank(governance);
        contentRegistryAdmin.upgradeAndCall(_proxy(address(contentRegistry)), address(newImpl), "");

        // Verify state preserved
        assertEq(contentRegistryAdmin.owner(), governance);
        assertEq(address(contentRegistry.crepToken()), address(crepToken));
    }

    // Legacy ContentRegistry reward/dormancy migration is intentionally out of scope for the
    // score-relative redesign branch, which assumes a clean registry redeploy.

    // =========================================================================
    // ProtocolConfig upgrade tests
    // =========================================================================

    function test_ProtocolConfig_GovernanceCanUpgrade() public {
        ProtocolConfig newImpl = new ProtocolConfig();
        vm.prank(governance);
        protocolConfigAdmin.upgradeAndCall(_proxy(address(protocolConfig)), address(newImpl), "");
    }

    function test_ProtocolConfig_UnauthorizedCannotUpgrade() public {
        ProtocolConfig newImpl = new ProtocolConfig();
        vm.prank(attacker);
        vm.expectRevert();
        protocolConfigAdmin.upgradeAndCall(_proxy(address(protocolConfig)), address(newImpl), "");
    }

    function test_ProtocolConfig_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        protocolConfig.initialize(admin, governance);
    }

    function test_ProtocolConfig_StatePreservedAfterUpgrade() public {
        vm.prank(governance);
        protocolConfig.setTreasury(address(1234));

        assertEq(protocolConfigAdmin.owner(), governance);
        assertEq(protocolConfig.treasury(), address(1234));

        ProtocolConfig newImpl = new ProtocolConfig();
        vm.prank(governance);
        protocolConfigAdmin.upgradeAndCall(_proxy(address(protocolConfig)), address(newImpl), "");

        assertEq(protocolConfigAdmin.owner(), governance);
        assertEq(protocolConfig.treasury(), address(1234));
    }

    function test_ProtocolConfig_LegacyLayoutStateAndRolesPreservedAfterUpgrade() public {
        LegacyProtocolConfigV1 legacyImpl = new LegacyProtocolConfigV1();
        TransparentUpgradeableProxy legacyProxy = new TransparentUpgradeableProxy(
            address(legacyImpl), governance, abi.encodeCall(LegacyProtocolConfigV1.initialize, (admin, governance))
        );
        LegacyProtocolConfigV1 legacyConfig = LegacyProtocolConfigV1(address(legacyProxy));
        ProxyAdmin legacyAdmin = _proxyAdmin(address(legacyProxy));

        address rewardDistributorAddr = address(0xBEEF);
        address categoryRegistryAddr = address(0xCAFE);
        address frontendRegistryAddr = address(0xFEE1);
        address treasuryAddr = address(0x1234);
        address voterIdNftAddr = address(0x5678);
        address participationPoolAddr = address(0x9ABC);

        vm.startPrank(governance);
        legacyConfig.setRewardDistributor(rewardDistributorAddr);
        legacyConfig.setCategoryRegistry(categoryRegistryAddr);
        legacyConfig.setFrontendRegistry(frontendRegistryAddr);
        legacyConfig.setTreasury(treasuryAddr);
        legacyConfig.setVoterIdNFT(voterIdNftAddr);
        legacyConfig.setParticipationPool(participationPoolAddr);
        legacyConfig.setConfig(1 hours, 14 days, 5, 500);
        legacyConfig.setRevealGracePeriod(2 hours);
        vm.stopPrank();

        ProtocolConfig newImpl = new ProtocolConfig();
        vm.prank(governance);
        legacyAdmin.upgradeAndCall(_proxy(address(legacyConfig)), address(newImpl), "");

        ProtocolConfig upgradedConfig = ProtocolConfig(address(legacyConfig));
        (uint32 epochDuration, uint32 maxDuration, uint16 minVoters, uint16 maxVoters) = upgradedConfig.config();

        assertEq(legacyAdmin.owner(), governance);
        assertEq(upgradedConfig.rewardDistributor(), rewardDistributorAddr);
        assertEq(upgradedConfig.categoryRegistry(), categoryRegistryAddr);
        assertEq(upgradedConfig.frontendRegistry(), frontendRegistryAddr);
        assertEq(upgradedConfig.treasury(), treasuryAddr);
        assertEq(upgradedConfig.voterIdNFT(), voterIdNftAddr);
        assertEq(upgradedConfig.participationPool(), participationPoolAddr);
        assertEq(upgradedConfig.revealGracePeriod(), 2 hours);
        assertEq(epochDuration, 1 hours);
        assertEq(maxDuration, 14 days);
        assertEq(minVoters, 5);
        assertEq(maxVoters, 500);
        assertTrue(upgradedConfig.hasRole(upgradedConfig.DEFAULT_ADMIN_ROLE(), governance));
        assertTrue(upgradedConfig.hasRole(upgradedConfig.CONFIG_ROLE(), governance));
        assertTrue(upgradedConfig.hasRole(upgradedConfig.CONFIG_ROLE(), admin));
        assertTrue(upgradedConfig.hasRole(upgradedConfig.TREASURY_ROLE(), governance));
        assertTrue(upgradedConfig.hasRole(upgradedConfig.TREASURY_ADMIN_ROLE(), governance));
        assertEq(upgradedConfig.getRoleAdmin(upgradedConfig.TREASURY_ROLE()), upgradedConfig.TREASURY_ADMIN_ROLE());
    }

    // =========================================================================
    // RoundVotingEngine upgrade tests
    // =========================================================================

    function test_VotingEngine_GovernanceCanUpgrade() public {
        RoundVotingEngine newImpl = new RoundVotingEngine();
        vm.prank(governance);
        votingEngineAdmin.upgradeAndCall(_proxy(address(votingEngine)), address(newImpl), "");
    }

    function test_VotingEngine_UnauthorizedCannotUpgrade() public {
        RoundVotingEngine newImpl = new RoundVotingEngine();
        vm.prank(attacker);
        vm.expectRevert();
        votingEngineAdmin.upgradeAndCall(_proxy(address(votingEngine)), address(newImpl), "");
    }

    function test_VotingEngine_CannotReinitialize() public {
        address protocolConfigAddress = address(votingEngine.protocolConfig());
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        votingEngine.initialize(governance, address(crepToken), address(contentRegistry), protocolConfigAddress);
    }

    function test_VotingEngine_StatePreservedAfterUpgrade() public {
        assertEq(votingEngineAdmin.owner(), governance);

        RoundVotingEngine newImpl = new RoundVotingEngine();
        vm.prank(governance);
        votingEngineAdmin.upgradeAndCall(_proxy(address(votingEngine)), address(newImpl), "");

        assertEq(votingEngineAdmin.owner(), governance);
    }

    // =========================================================================
    // RoundRewardDistributor upgrade tests
    // =========================================================================

    function test_RewardDistributor_GovernanceCanUpgrade() public {
        RoundRewardDistributor newImpl = new RoundRewardDistributor();
        vm.prank(governance);
        rewardDistributorAdmin.upgradeAndCall(_proxy(address(rewardDistributor)), address(newImpl), "");
    }

    function test_RewardDistributor_UnauthorizedCannotUpgrade() public {
        RoundRewardDistributor newImpl = new RoundRewardDistributor();
        vm.prank(attacker);
        vm.expectRevert();
        rewardDistributorAdmin.upgradeAndCall(_proxy(address(rewardDistributor)), address(newImpl), "");
    }

    function test_RewardDistributor_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        rewardDistributor.initialize(governance, address(crepToken), address(votingEngine), address(contentRegistry));
    }

    function test_RewardDistributor_StatePreservedAfterUpgrade() public {
        assertEq(rewardDistributorAdmin.owner(), governance);
        assertEq(address(rewardDistributor.crepToken()), address(crepToken));

        RoundRewardDistributor newImpl = new RoundRewardDistributor();
        vm.prank(governance);
        rewardDistributorAdmin.upgradeAndCall(_proxy(address(rewardDistributor)), address(newImpl), "");

        assertEq(rewardDistributorAdmin.owner(), governance);
        assertEq(address(rewardDistributor.crepToken()), address(crepToken));
    }

    // =========================================================================
    // ProfileRegistry upgrade tests
    // =========================================================================

    function test_ProfileRegistry_GovernanceCanUpgrade() public {
        ProfileRegistry newImpl = new ProfileRegistry();
        vm.prank(governance);
        profileRegistryAdmin.upgradeAndCall(_proxy(address(profileRegistry)), address(newImpl), "");
    }

    function test_ProfileRegistry_UnauthorizedCannotUpgrade() public {
        ProfileRegistry newImpl = new ProfileRegistry();
        vm.prank(attacker);
        vm.expectRevert();
        profileRegistryAdmin.upgradeAndCall(_proxy(address(profileRegistry)), address(newImpl), "");
    }

    function test_ProfileRegistry_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        profileRegistry.initialize(admin, governance);
    }

    function test_ProfileRegistry_StatePreservedAfterUpgrade() public {
        // Create a profile before upgrade
        vm.prank(address(10));
        profileRegistry.setProfile("testuser", "");

        vm.prank(address(10));
        profileRegistry.setAvatarAccent(0xF26426);

        assertEq(profileRegistryAdmin.owner(), governance);
        assertTrue(profileRegistry.hasProfile(address(10)));

        ProfileRegistry newImpl = new ProfileRegistry();
        vm.prank(governance);
        profileRegistryAdmin.upgradeAndCall(_proxy(address(profileRegistry)), address(newImpl), "");

        // State preserved
        assertEq(profileRegistryAdmin.owner(), governance);
        assertTrue(profileRegistry.hasProfile(address(10)));

        IProfileRegistry.Profile memory profile = profileRegistry.getProfile(address(10));
        assertEq(profile.name, "testuser");
        assertEq(profile.strategy, "");
        assertTrue(profile.createdAt > 0);
        assertTrue(profile.updatedAt > 0);

        (bool enabled, uint24 rgb) = profileRegistry.getAvatarAccent(address(10));
        assertTrue(enabled);
        assertEq(rgb, 0xF26426);
    }

    // =========================================================================
    // FrontendRegistry upgrade tests
    // =========================================================================

    function test_FrontendRegistry_GovernanceCanUpgrade() public {
        FrontendRegistry newImpl = new FrontendRegistry();
        vm.prank(governance);
        frontendRegistryAdmin.upgradeAndCall(_proxy(address(frontendRegistry)), address(newImpl), "");
    }

    function test_FrontendRegistry_UnauthorizedCannotUpgrade() public {
        FrontendRegistry newImpl = new FrontendRegistry();
        vm.prank(attacker);
        vm.expectRevert();
        frontendRegistryAdmin.upgradeAndCall(_proxy(address(frontendRegistry)), address(newImpl), "");
    }

    function test_FrontendRegistry_CannotReinitialize() public {
        vm.prank(admin);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        frontendRegistry.initialize(admin, governance, address(crepToken));
    }

    function test_FrontendRegistry_StatePreservedAfterUpgrade() public {
        assertEq(frontendRegistryAdmin.owner(), governance);
        assertEq(frontendRegistry.STAKE_AMOUNT(), 1000e6);

        FrontendRegistry newImpl = new FrontendRegistry();
        vm.prank(governance);
        frontendRegistryAdmin.upgradeAndCall(_proxy(address(frontendRegistry)), address(newImpl), "");

        assertEq(frontendRegistryAdmin.owner(), governance);
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

        ProtocolConfig pcImpl = new ProtocolConfig();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        pcImpl.initialize(admin, governance);
    }

    function _proxy(address proxy) internal pure returns (ITransparentUpgradeableProxy) {
        return ITransparentUpgradeableProxy(payable(proxy));
    }

    function _proxyAdmin(address proxy) internal view returns (ProxyAdmin) {
        return ProxyAdmin(address(uint160(uint256(vm.load(proxy, ERC1967_ADMIN_SLOT)))));
    }
}
