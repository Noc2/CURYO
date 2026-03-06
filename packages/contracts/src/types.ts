export type InheritedFunctions = { readonly [key: string]: string };

export type GenericContract = {
  address: `0x${string}`;
  abi: readonly unknown[];
  inheritedFunctions?: InheritedFunctions;
  external?: true;
  deployedOnBlock?: number;
};

export type GenericContractsDeclaration = {
  [chainId: number]: {
    [contractName: string]: GenericContract;
  };
};
