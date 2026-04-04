type TransactionStatusCalloutProps = {
  title: string;
  description?: string;
  blockExplorerLink?: string;
  className?: string;
  variant?: "inline" | "toast";
};

export function TransactionStatusCallout({
  title,
  description,
  blockExplorerLink,
  className = "",
  variant = "inline",
}: TransactionStatusCalloutProps) {
  const isInline = variant === "inline";
  const rootClassName = [isInline ? "rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName}>
      <div className={isInline ? "flex flex-col items-center text-center" : "flex flex-col text-left"}>
        <div className={isInline ? "flex items-center justify-center gap-2 text-primary" : "text-primary"}>
          {isInline ? <span className="loading loading-spinner loading-xs shrink-0" /> : null}
          <p className="text-sm font-semibold leading-5">{title}</p>
        </div>
        {description ? (
          <p
            className={
              isInline
                ? "mt-2 text-sm leading-relaxed text-base-content/70"
                : "mt-1 text-sm leading-relaxed text-base-content/70"
            }
          >
            {description}
          </p>
        ) : null}
        {blockExplorerLink ? (
          <a
            href={blockExplorerLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline"
          >
            View transaction
          </a>
        ) : null}
      </div>
    </div>
  );
}
