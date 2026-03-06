"use client";

import { PaginationButton, SearchBar, TransactionsTable } from "./_components";
import { LocalBlockExplorerGuard } from "./_components/LocalBlockExplorerGuard";
import type { NextPage } from "next";
import { useFetchBlocks } from "~~/hooks/scaffold-eth";

const LocalBlockExplorerPage = () => {
  const { blocks, transactionReceipts, currentPage, totalBlocks, setCurrentPage, error } = useFetchBlocks();

  if (error) {
    return (
      <div className="container mx-auto my-10 px-4">
        <div className="max-w-2xl rounded-3xl border border-base-300 bg-base-100 p-8 shadow-lg">
          <h1 className="text-2xl font-semibold">Cannot Reach Local Provider</h1>
          <p className="mt-3 text-base text-base-content/70">
            Start the local chain with <code className="rounded bg-base-200 px-1.5 py-0.5">yarn chain</code> and try
            again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto my-10">
      <SearchBar />
      <TransactionsTable blocks={blocks} transactionReceipts={transactionReceipts} />
      <PaginationButton currentPage={currentPage} totalItems={Number(totalBlocks)} setCurrentPage={setCurrentPage} />
    </div>
  );
};

const BlockExplorer: NextPage = () => {
  return (
    <LocalBlockExplorerGuard>
      <LocalBlockExplorerPage />
    </LocalBlockExplorerGuard>
  );
};

export default BlockExplorer;
