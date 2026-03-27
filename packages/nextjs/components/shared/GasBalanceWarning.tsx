import Link from "next/link";

interface GasBalanceWarningProps {
  nativeTokenSymbol: string;
}

export function GasBalanceWarning({ nativeTokenSymbol }: GasBalanceWarningProps) {
  return (
    <div className="bg-warning/10 rounded-lg p-4">
      <p className="text-base font-medium text-warning mb-2">Need {nativeTokenSymbol} for gas</p>
      <p className="text-base text-base-content/70">
        Add a little {nativeTokenSymbol}, then retry.{" "}
        <Link href="/docs/how-it-works#transaction-costs" className="link link-primary">
          See transaction costs
        </Link>
      </p>
    </div>
  );
}
