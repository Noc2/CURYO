// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import {
    TransparentUpgradeableProxy,
    ITransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { ProfileRegistry } from "../contracts/ProfileRegistry.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { IProfileRegistry } from "../contracts/interfaces/IProfileRegistry.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

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

        MockVoterIdNFT voterIdNFT = new MockVoterIdNFT();
        profileRegistry.setVoterIdNFT(address(voterIdNFT));
        frontendRegistry.setVoterIdNFT(address(voterIdNFT));
        voterIdNFT.setHolder(address(10));

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
        assertTrue(protocolConfig.hasRole(protocolConfig.DEFAULT_ADMIN_ROLE(), governance));
        assertTrue(protocolConfig.hasRole(protocolConfig.CONFIG_ROLE(), governance));
        assertTrue(protocolConfig.hasRole(protocolConfig.CONFIG_ROLE(), admin));
        assertTrue(protocolConfig.hasRole(protocolConfig.TREASURY_ADMIN_ROLE(), governance));
        assertTrue(protocolConfig.hasRole(protocolConfig.TREASURY_ROLE(), governance));
        assertEq(protocolConfig.getRoleAdmin(protocolConfig.TREASURY_ROLE()), protocolConfig.TREASURY_ADMIN_ROLE());

        ProtocolConfig newImpl = new ProtocolConfig();
        vm.prank(governance);
        protocolConfigAdmin.upgradeAndCall(_proxy(address(protocolConfig)), address(newImpl), "");

        assertEq(protocolConfigAdmin.owner(), governance);
        assertEq(protocolConfig.treasury(), address(1234));
        assertTrue(protocolConfig.hasRole(protocolConfig.DEFAULT_ADMIN_ROLE(), governance));
        assertTrue(protocolConfig.hasRole(protocolConfig.CONFIG_ROLE(), governance));
        assertTrue(protocolConfig.hasRole(protocolConfig.CONFIG_ROLE(), admin));
        assertTrue(protocolConfig.hasRole(protocolConfig.TREASURY_ADMIN_ROLE(), governance));
        assertTrue(protocolConfig.hasRole(protocolConfig.TREASURY_ROLE(), governance));
        assertEq(protocolConfig.getRoleAdmin(protocolConfig.TREASURY_ROLE()), protocolConfig.TREASURY_ADMIN_ROLE());
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
        assertEq(profile.selfReport, "");
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
