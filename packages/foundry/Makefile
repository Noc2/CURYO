.PHONY: build deploy generate-abis get-address account chain compile flatten fork format lint test verify verify-blockscout slither aderyn coverage

DEPLOY_SCRIPT ?= script/Deploy.s.sol

# setup wallet for anvil
setup-anvil-wallet:
	shx rm ~/.foundry/keystores/scaffold-eth-default 2>/dev/null; 	shx rm -rf broadcast/Deploy.s.sol/31337
	cast wallet import --private-key 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6 --unsafe-password 'localhost' scaffold-eth-default

# Start local chain
chain: setup-anvil-wallet
	anvil

# Start a fork
fork: setup-anvil-wallet
	anvil --fork-url ${FORK_URL} --chain-id 31337

# Deploy the contracts
deploy:
	@if [ ! -f "$(DEPLOY_SCRIPT)" ]; then 		echo "Error: Deploy script '$(DEPLOY_SCRIPT)' not found"; 		exit 1; 	fi
	@if [ "$(RPC_URL)" = "localhost" ]; then 		if [ "$(ETH_KEYSTORE_ACCOUNT)" = "scaffold-eth-default" ]; then 			forge script $(DEPLOY_SCRIPT) --rpc-url localhost --password localhost --broadcast --ffi --slow; 		else 			forge script $(DEPLOY_SCRIPT) --rpc-url localhost --broadcast --ffi --slow; 		fi 	else 		forge script $(DEPLOY_SCRIPT) --rpc-url $(RPC_URL) --account $(ETH_KEYSTORE_ACCOUNT) --broadcast --ffi --gas-estimate-multiplier 200 $(VERIFY_FLAGS); 	fi

# Deploy and generate ABIs
deploy-and-generate-abis: deploy generate-abis 

# Generate TypeScript ABIs
generate-abis:
	node scripts-js/generateTsAbis.js

# List account
account:
	@node scripts-js/checkAccountBalance.js

# Get address of a keystore
get-address:
	@cast wallet address --account $(ACCOUNT_NAME)

# Compile contracts
compile:
	forge compile

# Flatten contracts
flatten:
	forge flatten

# Format code
format:
	forge fmt && prettier --write ./scripts-js/**/*.js

# Lint code
lint:
	forge fmt --check && prettier --check ./scripts-js/**/*.js

# Run tests
test:
	forge test

# Verify contracts (Etherscan-compatible chains)
verify:
	forge script script/VerifyAll.s.sol --ffi --rpc-url $(RPC_URL)

# Verify a single contract on Blockscout (Celo chains)
# Usage: make verify-blockscout CONTRACT_ADDRESS=0x... CONTRACT_NAME=MyContract
BLOCKSCOUT_URL ?= https://celo-sepolia.blockscout.com/api/
verify-blockscout:
	forge verify-contract $(CONTRACT_ADDRESS) $(CONTRACT_NAME) --verifier blockscout --verifier-url $(BLOCKSCOUT_URL) --chain 11142220

# Static analysis
slither:
	slither . --config-file slither.config.json

aderyn:
	aderyn .

coverage:
	forge coverage --ir-minimum

