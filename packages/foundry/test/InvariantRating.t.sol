// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { VotingHandler } from "./handlers/VotingHandler.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

/// @title InvariantRating
/// @notice Invariant: after settlement, content rating is always in [0,100].
///         UP-majority rounds produce rating >= 50.
contract InvariantRating is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public distributor;
    VotingHandler public handler;

    address public owner = address(1);
    address public submitter = address(2);
    address public treasury = address(100);

    uint256 public constant NUM_VOTERS = 5;
    uint256 public constant VOTER_FUND = 100_000e6;
    uint256 public constant EPOCH_DURATION = 10 minutes;

    address[] public voters;
    uint256[] public contentIds;

    function setUp() public {
        vm.warp(1000);
        vm.roll(100);

        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );

        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry)))
                )
            )
        );

        distributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(engine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(engine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        engine.setRewardDistributor(address(distributor));
        engine.setCategoryRegistry(address(mockCategoryRegistry));
        engine.setTreasury(treasury);
        engine.setConfig(EPOCH_DURATION, 7 days, 2, 200);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(engine), reserveAmount);
        engine.addToConsensusReserve(reserveAmount);

        // Create voters
        for (uint256 i = 0; i < NUM_VOTERS; i++) {
            address voter = address(uint160(10 + i));
            voters.push(voter);
            crepToken.mint(voter, VOTER_FUND);
        }

        // Fund submitter and submit content
        crepToken.mint(submitter, 100e6);
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://example.com/rating1", "test", "test", "test", 0);
        registry.submitContent("https://example.com/rating2", "test", "test", "test", 0);
        vm.stopPrank();

        contentIds.push(1);
        contentIds.push(2);

        // Create handler
        handler = new VotingHandler(
            address(engine), address(distributor), address(registry), address(crepToken), voters, contentIds
        );

        targetContract(address(handler));
    }

    /// @notice After settlement, content rating is always in [0, 100].
    function invariant_RatingAlwaysBounded() public view {
        uint256 recordCount = handler.getRoundRecordCount();
        for (uint256 i = 0; i < recordCount; i++) {
            VotingHandler.RoundRecord memory rec = handler.getRoundRecord(i);
            if (!rec.settled) continue;

            (, , , , , , , , , , uint256 rating,) = registry.contents(rec.contentId);
            assertLe(rating, 100, "rating exceeds 100");
        }
    }

    /// @notice UP-majority rounds should produce rating >= 50.
    function invariant_UpMajorityRatingGe50() public view {
        uint256 recordCount = handler.getRoundRecordCount();
        for (uint256 i = 0; i < recordCount; i++) {
            VotingHandler.RoundRecord memory rec = handler.getRoundRecord(i);
            if (!rec.settled) continue;

            RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, rec.contentId, rec.roundId);
            // Only check rounds where UP side had strictly more raw stake
            if (round.upPool <= round.downPool) continue;

            (, , , , , , , , , , uint256 rating,) = registry.contents(rec.contentId);
            assertGe(rating, 50, "UP-majority round produced rating < 50");
        }
    }
}
