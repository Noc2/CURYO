// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Test } from "forge-std/Test.sol";

import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { ContentSubmissionTestBase } from "./helpers/VotingTestHelpers.sol";

contract SubmitterIdentityReservationTest is Test, ContentSubmissionTestBase {
    ContentRegistry public registry;
    CuryoReputation public crepToken;
    MockCategoryRegistry public mockCategoryRegistry;
    MockVoterIdNFT public mockVoterIdNFT;

    address public owner = address(1);
    address public submitter = address(2);
    address public delegate = address(3);

    function setUp() public {
        vm.warp(1000);

        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );

        mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));

        mockVoterIdNFT = new MockVoterIdNFT();
        registry.setVoterIdNFT(address(mockVoterIdNFT));

        crepToken.mint(submitter, 100e6);
        crepToken.mint(delegate, 100e6);

        vm.stopPrank();
    }

    function test_NormalReveal_WithUnchangedIdentity_Succeeds() public {
        vm.prank(owner);
        mockVoterIdNFT.setHolder(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 contentId = _submitContentWithReservation(
            registry, "https://example.com/unchanged-identity", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        assertEq(registry.getSubmitterIdentity(contentId), submitter);
    }

    function test_SubmitContent_RevealRevertsWhenSubmitterIdentityChanges() public {
        vm.prank(owner);
        mockVoterIdNFT.setHolder(submitter);

        vm.prank(submitter);
        mockVoterIdNFT.setDelegate(delegate);

        string memory url = "https://example.com/delegate-content";
        string memory title = "goal";
        string memory description = "goal";
        string memory tags = "tags";
        bytes32 salt = keccak256("delegate-content-salt");

        vm.startPrank(delegate);
        crepToken.approve(address(registry), 10e6);
        (uint256 resolvedCategoryId, bytes32 submissionKey) = registry.previewSubmissionKey(url, 0);
        assertEq(resolvedCategoryId, 1);
        bytes32 revealCommitment = keccak256(abi.encode(submissionKey, title, description, tags, 0, salt, delegate));
        registry.reserveSubmission(revealCommitment);
        vm.stopPrank();

        vm.prank(submitter);
        mockVoterIdNFT.removeDelegate();

        vm.prank(delegate);
        mockVoterIdNFT.setHolder(delegate);

        vm.warp(block.timestamp + 1);

        vm.startPrank(delegate);
        vm.expectRevert("Submitter identity changed");
        registry.submitContent(url, title, description, tags, 0, salt);
        vm.stopPrank();
    }

    function test_SubmitQuestion_RevealRevertsWhenSubmitterIdentityChanges() public {
        vm.prank(owner);
        mockVoterIdNFT.setHolder(submitter);

        vm.prank(submitter);
        mockVoterIdNFT.setDelegate(delegate);

        string memory title = "Is this supported?";
        string memory description = "Question submission identity should remain stable.";
        string memory tags = "identity";
        string memory url = "https://example.com/identity-check.jpg";
        bytes32 salt = keccak256("delegate-question-salt");

        vm.startPrank(delegate);
        crepToken.approve(address(registry), 10e6);
        (uint256 resolvedCategoryId, bytes32 submissionKey) =
            registry.previewQuestionSubmissionKey(url, title, description, tags, 1);
        bytes32 revealCommitment = keccak256(abi.encode(submissionKey, title, description, tags, 1, salt, delegate));
        registry.reserveSubmission(revealCommitment);
        vm.stopPrank();

        vm.prank(submitter);
        mockVoterIdNFT.removeDelegate();

        vm.prank(delegate);
        mockVoterIdNFT.setHolder(delegate);

        vm.warp(block.timestamp + 1);

        vm.startPrank(delegate);
        vm.expectRevert("Submitter identity changed");
        registry.submitQuestion(url, title, description, tags, resolvedCategoryId, salt);
        vm.stopPrank();
    }
}
