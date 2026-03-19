// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { ProfileRegistry } from "../contracts/ProfileRegistry.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { IProfileRegistry } from "../contracts/interfaces/IProfileRegistry.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

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
        profileRegistry.setProfile("testuser", "");

        vm.prank(address(10));
        profileRegistry.setAvatarAccent(0xF26426);

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
