// SPDX-License-Identifier: MIT
/// @dev FOR TESTING ONLY — DO NOT DEPLOY TO PRODUCTION
pragma solidity 0.8.28;

import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import { SelfStructs } from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";

/// @title MockIdentityVerificationHub
/// @notice Mock implementation of Self.xyz IdentityVerificationHub for local testing
/// @dev Allows simulating passport verification without actual ZK proofs
contract MockIdentityVerificationHub {
    // --- Constants ---

    bytes32 public constant MOCK_CONFIG_ID = keccak256("mock-config");

    // --- State ---

    /// @notice Track verified users (address => verified status)
    mapping(address => bool) public verifiedUsers;

    /// @notice Track user nullifiers (address => nullifier)
    mapping(address => uint256) public userNullifiers;

    /// @notice Counter for generating unique nullifiers
    uint256 private _nullifierCounter;

    // --- Events ---

    event UserVerified(address indexed user, uint256 nullifier);
    event VerificationSimulated(address indexed targetContract, address indexed user);

    // --- Mock Configuration Functions ---

    /// @notice Set a user as verified with an auto-generated nullifier
    /// @param user The user address to verify
    function setVerified(address user) external {
        _nullifierCounter++;
        uint256 nullifier = uint256(keccak256(abi.encodePacked(user, _nullifierCounter, block.timestamp)));

        verifiedUsers[user] = true;
        userNullifiers[user] = nullifier;

        emit UserVerified(user, nullifier);
    }

    /// @notice Set a user as verified with a specific nullifier
    /// @param user The user address to verify
    /// @param nullifier The specific nullifier to use
    function setVerifiedWithNullifier(address user, uint256 nullifier) external {
        verifiedUsers[user] = true;
        userNullifiers[user] = nullifier;

        emit UserVerified(user, nullifier);
    }

    /// @notice Remove verification status from a user
    /// @param user The user address to unverify
    function removeVerification(address user) external {
        verifiedUsers[user] = false;
        userNullifiers[user] = 0;
    }

    // --- Hub Interface Mocks ---

    /// @notice Mock implementation of setVerificationConfigV2
    /// @dev Always returns the same mock config ID
    function setVerificationConfigV2(
        SelfStructs.VerificationConfigV2 memory /* config */
    )
        external
        pure
        returns (bytes32)
    {
        return MOCK_CONFIG_ID;
    }

    /// @notice Check if a verification config exists
    /// @dev Always returns true for the mock config ID
    function verificationConfigV2Exists(bytes32 configId) external pure returns (bool) {
        return configId == MOCK_CONFIG_ID;
    }

    /// @notice Mock verify function - not used in testing, simulation is done via simulateVerification
    function verify(
        bytes calldata,
        /* baseVerificationInput */
        bytes calldata /* userContextData */
    )
        external
        pure
    {
        revert("Use simulateVerification for testing");
    }

    // --- Testing Functions ---

    /// @notice Simulate a successful verification by directly calling the target contract
    /// @dev Bypasses the actual ZK verification for testing purposes
    /// @param targetContract The contract to call (e.g., HumanFaucet)
    /// @param user The user address being verified
    function simulateVerification(address targetContract, address user) external {
        require(verifiedUsers[user], "User not verified");
        require(userNullifiers[user] != 0, "No nullifier set");

        // Build the GenericDiscloseOutputV2 output
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = bytes32(0);
        output.userIdentifier = uint256(uint160(user));
        output.nullifier = userNullifiers[user];
        output.olderThan = 18; // Default to adult (18+) for standard test flow

        // Encode the output for the callback
        bytes memory encodedOutput = abi.encode(output);

        // Call onVerificationSuccess on the target contract
        ISelfVerificationRoot(targetContract).onVerificationSuccess(encodedOutput, "");

        emit VerificationSimulated(targetContract, user);
    }

    /// @notice Simulate verification with custom output data
    /// @param targetContract The contract to call
    /// @param output Custom output data
    function simulateVerificationWithOutput(
        address targetContract,
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output
    ) external {
        bytes memory encodedOutput = abi.encode(output);
        ISelfVerificationRoot(targetContract).onVerificationSuccess(encodedOutput, "");

        emit VerificationSimulated(targetContract, address(uint160(output.userIdentifier)));
    }

    /// @notice Simulate verification with userData (for referral testing)
    /// @param targetContract The contract to call (e.g., HumanFaucet)
    /// @param user The user address being verified
    /// @param userData Custom user data to pass (e.g., encoded referrer address)
    function simulateVerificationWithUserData(address targetContract, address user, bytes memory userData) external {
        require(verifiedUsers[user], "User not verified");
        require(userNullifiers[user] != 0, "No nullifier set");

        // Build the GenericDiscloseOutputV2 output
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = bytes32(0);
        output.userIdentifier = uint256(uint160(user));
        output.nullifier = userNullifiers[user];
        output.olderThan = 18; // Default to adult (18+) for standard test flow

        // Encode the output for the callback
        bytes memory encodedOutput = abi.encode(output);

        // Call onVerificationSuccess with userData
        ISelfVerificationRoot(targetContract).onVerificationSuccess(encodedOutput, userData);

        emit VerificationSimulated(targetContract, user);
    }

    /// @notice Simulate verification with a custom age value (for testing age restrictions)
    /// @param targetContract The contract to call (e.g., HumanFaucet)
    /// @param user The user address being verified
    /// @param age The age to set in the output (use < 18 for underage testing)
    function simulateVerificationWithAge(address targetContract, address user, uint256 age) external {
        require(verifiedUsers[user], "User not verified");
        require(userNullifiers[user] != 0, "No nullifier set");

        // Build the GenericDiscloseOutputV2 output
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = bytes32(0);
        output.userIdentifier = uint256(uint160(user));
        output.nullifier = userNullifiers[user];
        output.olderThan = age;

        // Encode the output for the callback
        bytes memory encodedOutput = abi.encode(output);

        // Call onVerificationSuccess on the target contract
        ISelfVerificationRoot(targetContract).onVerificationSuccess(encodedOutput, "");

        emit VerificationSimulated(targetContract, user);
    }
}
