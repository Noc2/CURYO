.PHONY: build deploy generate-abis get-address account chain compile compile-all flatten fork format lint test verify verify-blockscout slither aderyn coverage check-contract-sizes

DEPLOY_SCRIPT ?= script/Deploy.s.sol
TEST_ARGS ?=
COVERAGE_ARGS ?=
RESUME_FLAG ?=
DEPLOY_FLOW_FLAGS ?=
DEPLOY_PROFILE ?= deploy
LOCALHOST_EVM_SIZE_FLAGS ?= --disable-code-size-limit

# setup wallet for anvil
setup-anvil-wallet:
	shx rm ~/.foundry/keystores/scaffold-eth-default 2>/dev/null; 	shx rm -rf broadcast/Deploy.s.sol/31337
	cast wallet import --private-key 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6 --unsafe-password 'localhost' scaffold-eth-default

# Start local chain
chain: setup-anvil-wallet
	anvil $(LOCALHOST_EVM_SIZE_FLAGS)

# Start a fork
fork: setup-anvil-wallet
	anvil --fork-url ${FORK_URL} --chain-id 31337 $(LOCALHOST_EVM_SIZE_FLAGS)

# Deploy the contracts
deploy:
	@if [ ! -f "$(DEPLOY_SCRIPT)" ]; then 		echo "Error: Deploy script '$(DEPLOY_SCRIPT)' not found"; 		exit 1; 	fi
	@if [ "$(RPC_URL)" = "localhost" ]; then 		if [ "$(ETH_KEYSTORE_ACCOUNT)" = "scaffold-eth-default" ]; then 			FOUNDRY_PROFILE=$(DEPLOY_PROFILE) forge script $(DEPLOY_SCRIPT) --rpc-url localhost --password localhost --broadcast --ffi --slow --non-interactive $(LOCALHOST_EVM_SIZE_FLAGS) $(RESUME_FLAG); 		else 			FOUNDRY_PROFILE=$(DEPLOY_PROFILE) forge script $(DEPLOY_SCRIPT) --rpc-url localhost --broadcast --ffi --slow --non-interactive $(LOCALHOST_EVM_SIZE_FLAGS) $(RESUME_FLAG); 		fi 	else 		FOUNDRY_PROFILE=$(DEPLOY_PROFILE) forge script $(DEPLOY_SCRIPT) --rpc-url $(RPC_URL) --account $(ETH_KEYSTORE_ACCOUNT) --broadcast --ffi --gas-estimate-multiplier 200 $(DEPLOY_FLOW_FLAGS) $(RESUME_FLAG) $(VERIFY_FLAGS); 	fi

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
	forge compile --skip test script

compile-all:
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
	forge test --offline $(TEST_ARGS)

# Verify contracts (Etherscan-compatible chains)
verify:
	FOUNDRY_PROFILE=$(DEPLOY_PROFILE) forge script script/VerifyAll.s.sol --ffi --rpc-url $(RPC_URL)

# Verify a single contract on Blockscout (Celo chains)
# Usage: make verify-blockscout NETWORK=<celo|celoSepolia> CONTRACT_ADDRESS=0x... CONTRACT_NAME=MyContract
# Optional overrides: BLOCKSCOUT_URL=... BLOCKSCOUT_CHAIN_ID=...
verify-blockscout:
	@if [ -z "$(NETWORK)" ]; then \
		echo "Missing NETWORK. Use NETWORK=celo or NETWORK=celoSepolia."; \
		exit 1; \
	fi
	@if [ -z "$(CONTRACT_ADDRESS)" ] || [ -z "$(CONTRACT_NAME)" ]; then \
		echo "Usage: make verify-blockscout NETWORK=<celo|celoSepolia> CONTRACT_ADDRESS=0x... CONTRACT_NAME=MyContract"; \
		exit 1; \
	fi
	@case "$(NETWORK)" in \
		celo) \
			blockscout_url="https://celo.blockscout.com/api/"; \
			chain_id="42220"; \
			;; \
		celoSepolia) \
			blockscout_url="https://celo-sepolia.blockscout.com/api/"; \
			chain_id="11142220"; \
			;; \
		*) \
			echo "Unsupported NETWORK='$(NETWORK)'. Use celo or celoSepolia."; \
			exit 1; \
			;; \
	esac; \
	if [ -n "$(BLOCKSCOUT_URL)" ]; then blockscout_url="$(BLOCKSCOUT_URL)"; fi; \
	if [ -n "$(BLOCKSCOUT_CHAIN_ID)" ]; then chain_id="$(BLOCKSCOUT_CHAIN_ID)"; fi; \
	forge verify-contract $(CONTRACT_ADDRESS) $(CONTRACT_NAME) --verifier blockscout --verifier-url $$blockscout_url --chain $$chain_id

# Static analysis
slither:
	slither . --config-file slither.config.json

aderyn:
	aderyn .

coverage:
	forge coverage --offline --ir-minimum $(COVERAGE_ARGS)

check-contract-sizes:
	FOUNDRY_PROFILE=$(DEPLOY_PROFILE) forge build --skip script --skip test
	bash scripts/check-contract-sizes.sh
