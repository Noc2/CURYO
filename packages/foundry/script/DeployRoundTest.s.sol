// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console } from "forge-std/Script.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";

/// @notice Minimal deployment for TypeScript round integration tests.
/// @dev Deploys CuryoReputation, ContentRegistry, RoundVotingEngine,
///      and RoundRewardDistributor. Writes addresses to a JSON file.
///
/// Usage:
///   anvil &
///   forge script script/DeployRoundTest.s.sol --broadcast --rpc-url http://127.0.0.1:8545
contract DeployRoundTest is Script {
    function run() external {
        uint256 deployerKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy CuryoReputation
        CuryoReputation crepToken = new CuryoReputation(deployer, deployer);
        crepToken.grantRole(crepToken.MINTER_ROLE(), deployer);

        // 2. Deploy implementations
        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        // 3. Deploy proxies
        ContentRegistry registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (deployer, deployer, address(crepToken)))
                )
            )
        );

        RoundVotingEngine votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize, (deployer, deployer, address(crepToken), address(registry))
                    )
                )
            )
        );

        RoundRewardDistributor rewardDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (deployer, address(crepToken), address(votingEngine), address(registry))
                    )
                )
            )
        );

        // 4. Wire contracts
        registry.setVotingEngine(address(votingEngine));
        votingEngine.setRewardDistributor(address(rewardDistributor));
        votingEngine.setTreasury(deployer);
        crepToken.setContentVotingContracts(address(votingEngine), address(registry));

        // 5. Short epoch for testing (15 minutes), low minVoters
        votingEngine.setConfig(15 minutes, 7 days, 2, 200);

        // 6. Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(deployer, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.addToConsensusReserve(reserveAmount);

        // 7. Mint test tokens to Anvil accounts (deployer + accounts 1-3)
        crepToken.mint(deployer, 100_000e6);
        address[3] memory testAccounts = [
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8, // account 1
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, // account 2
            0x90F79bf6EB2c4f870365E785982E1f101E93b906 // account 3
        ];
        for (uint256 i = 0; i < testAccounts.length; i++) {
            crepToken.mint(testAccounts[i], 10_000e6);
        }

        vm.stopBroadcast();

        // 8. Write addresses JSON
        string memory json = string(
            abi.encodePacked(
                '{"crepToken":"',
                vm.toString(address(crepToken)),
                '","contentRegistry":"',
                vm.toString(address(registry)),
                '","votingEngine":"',
                vm.toString(address(votingEngine)),
                '","rewardDistributor":"',
                vm.toString(address(rewardDistributor)),
                '","deployer":"',
                vm.toString(deployer),
                '"}'
            )
        );
        vm.writeFile("test-addresses.json", json);

        console.log("=== Round Test Deployment ===");
        console.log("CuryoReputation:", address(crepToken));
        console.log("ContentRegistry:", address(registry));
        console.log("RoundVotingEngine:", address(votingEngine));
        console.log("RoundRewardDistributor:", address(rewardDistributor));
        console.log("Addresses written to test-addresses.json");
    }
}
