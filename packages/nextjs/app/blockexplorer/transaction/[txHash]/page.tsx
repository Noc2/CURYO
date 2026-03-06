import TransactionComp from "../_components/TransactionComp";
import type { NextPage } from "next";
import { Hash } from "viem";
import { LocalBlockExplorerGuard } from "~~/app/blockexplorer/_components/LocalBlockExplorerGuard";
import { isZeroAddress } from "~~/utils/scaffold-eth/common";

type PageProps = {
  params: Promise<{ txHash?: Hash }>;
};

export function generateStaticParams() {
  // An workaround to enable static exports in Next.js, generating single dummy page.
  return [{ txHash: "0x0000000000000000000000000000000000000000" }];
}
const TransactionPage: NextPage<PageProps> = async (props: PageProps) => {
  const params = await props.params;
  const txHash = params?.txHash as Hash;

  if (isZeroAddress(txHash)) return null;

  return (
    <LocalBlockExplorerGuard>
      <TransactionComp txHash={txHash} />
    </LocalBlockExplorerGuard>
  );
};

export default TransactionPage;
