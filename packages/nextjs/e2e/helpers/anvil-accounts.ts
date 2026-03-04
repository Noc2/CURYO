/**
 * Well-known Anvil/Hardhat accounts.
 * Deterministic and identical across all Anvil instances.
 *
 * After `yarn deploy` on chain 31337 (local dev):
 * - Accounts #2-#10 get 1000 cREP + a VoterID NFT
 * - Account #9 is the scaffold-eth-default deployer (has ADMIN_ROLE,
 *   GOVERNANCE_ROLE, CONFIG_ROLE, VoterIdNFT ownership, etc.)
 * - Account #0 gets MINTER_ROLE on CuryoReputation + VoterIdNFT.addMinter()
 *
 * Content seeded by `SeedContent.sh`:
 *   #1 = Account #2 (YouTube/Ethereum)           [cat 1: YouTube]
 *   #2 = Account #3 (Twitch)                     [cat 2: Twitch]
 *   #3 = Account #4 (YouTube/Neural Networks)     [cat 1: YouTube]
 *   #4 = Account #5 (Scryfall/Black Lotus)        [cat 3: MTG]
 *   #5 = Account #6 (TMDB/Godfather)              [cat 4: Movies]
 *   #6 = Account #7 (Wikipedia/Messi)             [cat 5: People]
 *   #7 = Account #8 (Wikipedia/Curie)             [cat 5: People]
 *   #8 = Account #9 (RAWG/Elden Ring)             [cat 6: Games]
 *   #9 = Account #10 (RAWG/Baldur's Gate 3)       [cat 6: Games]
 *  #10 = Account #2 (Open Library/Mr Fox)          [cat 7: Books]
 *  #11 = Account #3 (Open Library/Hitchhiker's)    [cat 7: Books]
 *  #12 = Account #4 (CoinGecko/Bitcoin)            [cat 9: Crypto Tokens]
 *  #13 = Account #5 (CoinGecko/Ethereum)           [cat 9: Crypto Tokens]
 */

export const ANVIL_ACCOUNTS = {
  /** Account #0 — has MINTER_ROLE only, NOT the deployer */
  account0: {
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  },
  /** NOT pre-funded */
  account1: {
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  },
  /** 1000 cREP + VoterID #100 — submitted content #1 and #10 */
  account2: {
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  },
  /** 1000 cREP + VoterID #101 — submitted content #2 and #11 */
  account3: {
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  },
  /** 1000 cREP + VoterID #102 — submitted content #3 and #12 */
  account4: {
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  },
  /** 1000 cREP + VoterID #103 — submitted content #4 and #13 */
  account5: {
    privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  },
  /** 1000 cREP + VoterID #104 — submitted content #5 */
  account6: {
    privateKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  },
  /** 1000 cREP + VoterID #105 — submitted content #6 */
  account7: {
    privateKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  },
  /** 1000 cREP + VoterID #106 — submitted content #7 */
  account8: {
    privateKey: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
    address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  },
  /**
   * 1000 cREP + VoterID #107 — submitted content #8. Also voted in seed.
   * ALSO the scaffold-eth-default deployer: has ADMIN_ROLE, GOVERNANCE_ROLE,
   * CONFIG_ROLE on all registries, and is VoterIdNFT owner.
   */
  account9: {
    privateKey: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
    address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
  },
  /** 1000 cREP + VoterID #108 — submitted content #9. Also voted in seed. */
  account10: {
    privateKey: "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897",
    address: "0xBcd4042DE499D14e55001CcbB24a551F3b954096",
  },
  /** NOT pre-funded — used for VoterID revocation test (minted on demand) */
  account11: {
    privateKey: "0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd",
    address: "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec",
  },
} as const;

/** Alias for the actual deployer/governance account (scaffold-eth-default = Anvil account #9) */
export const DEPLOYER = ANVIL_ACCOUNTS.account9;
