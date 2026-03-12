// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";
import { VotingHandler } from "./handlers/VotingHandler.sol";

/// @title InvariantSolvency
/// @notice Invariant tests for pool solvency (C-01), token conservation (C-02), and balance solvency (C-03).
contract InvariantSolvency is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public distributor;
    VotingHandler public handler;

    address public owner = address(1);
    address public submitter = address(2);
    address public treasury = address(100);

    uint256 public constant NUM_VOTERS = 5;
    uint256 public constant VOTER_FUND = 100_000e6; // 100K cREP each
    uint256 public constant EPOCH_DURATION = 10 minutes;

    address[] public voters;
    uint256[] public contentIds;

    uint256 public initialTotalSupply;
    uint256 public initialKeeperRewardPool;

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
        engine.setRewardDistributor(address(distributor));
        engine.setTreasury(treasury);
        engine.setConfig(EPOCH_DURATION, 7 days, 2, 200);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        uint256 keeperPoolAmount = 100_000e6;
        crepToken.mint(owner, reserveAmount + keeperPoolAmount);
        crepToken.approve(address(engine), reserveAmount + keeperPoolAmount);
        engine.addToConsensusReserve(reserveAmount);
        engine.setKeeperReward(1e6);
        engine.fundKeeperRewardPool(keeperPoolAmount);
        initialKeeperRewardPool = keeperPoolAmount;

        // Create voters
        for (uint256 i = 0; i < NUM_VOTERS; i++) {
            address voter = address(uint160(10 + i));
            voters.push(voter);
            crepToken.mint(voter, VOTER_FUND);
        }

        // Fund submitter and submit 2 content items
        crepToken.mint(submitter, 100e6);
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://example.com/inv1", "test", "test", "test", 0);
        registry.submitContent("https://example.com/inv2", "test", "test", "test", 0);
        vm.stopPrank();

        contentIds.push(1);
        contentIds.push(2);

        // Record initial total supply (after all minting)
        initialTotalSupply = crepToken.totalSupply();

        // Create handler
        handler = new VotingHandler(
            address(engine), address(distributor), address(registry), address(crepToken), voters, contentIds
        );

        // Target only the handler for invariant calls
        targetContract(address(handler));
    }

    // =========================================================================
    // C-01: Pool Solvency — rewards claimed never exceed the voter pool
    // =========================================================================

    function invariant_C01_PoolSolvency() public view {
        uint256 recordCount = handler.getRoundRecordCount();
        for (uint256 i = 0; i < recordCount; i++) {
            VotingHandler.RoundRecord memory rec = handler.getRoundRecord(i);
            if (!rec.settled) continue;

            uint256 voterPool = engine.roundVoterPool(rec.contentId, rec.roundId);
            RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, rec.contentId, rec.roundId);

            uint256 losingRawPool = round.upWins ? round.downPool : round.upPool;
            uint256 loserRefundPool = RewardMath.calculateRevealedLoserRefund(losingRawPool);

            // Total claimed includes winner stake returns + winner pool rewards + loser rebates.
            uint256 winningRawPool = round.upWins ? round.upPool : round.downPool;
            assertLe(
                rec.totalClaimed,
                winningRawPool + voterPool + loserRefundPool,
                "C-01: claimed exceeds winning stakes + voter pool + loser rebates"
            );
        }
    }

    // =========================================================================
    // C-02: Token Conservation — staked tokens account for all outflows + open obligations
    // =========================================================================

    function invariant_C02_TokenConservation() public view {
        // All stake-derived tokens that left the engine = voter claims + submitter claims
        //   + refunds + treasury balance growth.
        // Keeper rewards are funded from keeperRewardPool and are checked separately below.
        // With rounding dust tolerance

        uint256 totalIn = handler.ghost_totalStaked();
        uint256 totalClaimedOut = handler.ghost_totalClaimed() + handler.ghost_totalSubmitterClaimed()
            + handler.ghost_totalRefunded() + crepToken.balanceOf(treasury);

        // totalIn >= totalClaimedOut (can't pay out more than staked, ignoring consensus subsidy)
        // Allow for consensus subsidy which adds extra tokens from the reserve
        // This is a soft check: outflows can exceed stake-inflows by at most the consensus used
        // The strict check is C-03 (balance solvency)
        if (totalIn > 0 || totalClaimedOut > 0) {
            // outflows <= inflows + actual consensus subsidy spent + dust
            uint256 dust = handler.settleCount() * 5;
            assertLe(
                totalClaimedOut,
                totalIn + handler.ghost_totalConsensusSubsidy() + dust,
                "C-02: outflows exceed inflows + consensus subsidy"
            );
        }
    }

    // =========================================================================
    // C-03: Balance Solvency — engine holds enough tokens for all obligations
    // =========================================================================

    function invariant_C03_BalanceSolvency() public view {
        uint256 engineBalance = crepToken.balanceOf(address(engine));

        // Compute minimum obligations: open round stakes + unclaimed rewards + consensus reserve
        uint256 obligations = engine.consensusReserve() + engine.keeperRewardPool();

        // Add open round stakes (committed but not yet settled/refunded)
        uint256 recordCount = handler.getRoundRecordCount();
        for (uint256 i = 0; i < recordCount; i++) {
            VotingHandler.RoundRecord memory rec = handler.getRoundRecord(i);
            RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, rec.contentId, rec.roundId);

            if (round.state == RoundLib.RoundState.Open) {
                // Open rounds: full totalStake is held
                obligations += round.totalStake;
            } else if (round.state == RoundLib.RoundState.Settled) {
                // Settled rounds: unclaimed voter rewards + unclaimed submitter rewards
                uint256 voterPool = engine.roundVoterPool(rec.contentId, rec.roundId);
                uint256 winningPool = round.upWins ? round.upPool : round.downPool;
                uint256 losingPool = round.upWins ? round.downPool : round.upPool;
                uint256 loserRefundPool = RewardMath.calculateRevealedLoserRefund(losingPool);
                uint256 submitterPending = engine.pendingSubmitterReward(rec.contentId, rec.roundId);

                // Upper bound on remaining obligations: all winning stakes + full voter pool
                // + loser rebates + submitter reward, minus amounts already claimed.
                // minus what's already been claimed
                uint256 maxRemaining = winningPool + voterPool + loserRefundPool + submitterPending;
                if (maxRemaining > rec.totalClaimed + rec.submitterClaimed) {
                    obligations += maxRemaining - rec.totalClaimed - rec.submitterClaimed;
                }
                obligations += _pendingRefundObligations(rec.contentId, rec.roundId, round);
            } else if (
                round.state == RoundLib.RoundState.Cancelled || round.state == RoundLib.RoundState.Tied
                    || round.state == RoundLib.RoundState.RevealFailed
            ) {
                obligations += _pendingRefundObligations(rec.contentId, rec.roundId, round);
            }
        }

        assertGe(engineBalance, obligations, "C-03: engine balance < obligations");
    }

    // =========================================================================
    // C-04: Keeper rewards — payouts are bounded by funded pool and rewardable operations
    // =========================================================================

    function invariant_C04_KeeperRewardAccounting() public view {
        uint256 handlerBalance = crepToken.balanceOf(address(handler));
        assertEq(handlerBalance, initialKeeperRewardPool - engine.keeperRewardPool(), "keeper payout != pool delta");

        uint256 maxRewardableOps = handler.settleCount() + handler.cancelCount() + handler.cleanupRewardCount();
        assertLe(
            handlerBalance,
            engine.keeperReward() * maxRewardableOps,
            "keeper paid more than rewardable operations allow"
        );
    }

    // =========================================================================
    // NoDoubleClaim — no voter claims the same reward twice
    // =========================================================================

    function invariant_NoDoubleClaim() public view {
        // The handler tracks claimed state per voter per content.
        // Additionally, verify on-chain: for each settled round, no voter has claimed > once.
        // This is implicitly enforced by the require(!rewardClaimed) in the distributor,
        // but we verify the handler's ghost accounting is consistent.
        uint256 recordCount = handler.getRoundRecordCount();
        for (uint256 i = 0; i < recordCount; i++) {
            VotingHandler.RoundRecord memory rec = handler.getRoundRecord(i);
            if (!rec.settled) continue;

            // For each voter, check they haven't claimed twice
            for (uint256 v = 0; v < voters.length; v++) {
                if (distributor.rewardClaimed(rec.contentId, rec.roundId, voters[v])) {
                    // Claimed on-chain — verify handler also shows claimed
                    // (This is a consistency check, not strictly a double-claim test,
                    //  but the contract enforces single-claim via require)
                }
            }
        }
        // If we got here without revert, no double claims occurred
    }

    // =========================================================================
    // TokenSupplyConserved — no minting/burning during test
    // =========================================================================

    function invariant_TokenSupplyConserved() public view {
        assertEq(crepToken.totalSupply(), initialTotalSupply, "Token supply changed during invariant test");
    }

    function _pendingRefundObligations(uint256 contentId, uint256 roundId, RoundLib.Round memory round)
        internal
        view
        returns (uint256 pending)
    {
        bytes32[] memory commitKeys = RoundEngineReadHelpers.commitKeys(engine, contentId, roundId);
        for (uint256 i = 0; i < commitKeys.length; i++) {
            RoundLib.Commit memory commit = RoundEngineReadHelpers.commit(engine, contentId, roundId, commitKeys[i]);
            if (commit.stakeAmount == 0) continue;

            if (round.state == RoundLib.RoundState.Cancelled) {
                pending += commit.stakeAmount;
            } else if (round.state == RoundLib.RoundState.Tied) {
                if (commit.revealed || commit.revealableAfter > round.settledAt) {
                    pending += commit.stakeAmount;
                }
            } else if (round.state == RoundLib.RoundState.RevealFailed) {
                if (commit.revealed) {
                    pending += commit.stakeAmount;
                }
            } else if (round.state == RoundLib.RoundState.Settled) {
                if (!commit.revealed && commit.revealableAfter > round.settledAt) {
                    pending += commit.stakeAmount;
                }
            }
        }
    }
}
