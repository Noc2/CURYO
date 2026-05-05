import Link from "next/link";
import styles from "./LandingPageActions.module.css";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { DOCS_AI_ROUTE, RATE_ROUTE } from "~~/constants/routes";

export function LandingPageActions() {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
      <Link href={RATE_ROUTE} prefetch={false} className={`btn btn-primary ${styles.cta} ${styles.primary}`}>
        <span>Earn USDC</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-current" />
        </span>
      </Link>
      <Link href={DOCS_AI_ROUTE} prefetch={false} className={`btn whitespace-nowrap ${styles.cta} ${styles.secondary}`}>
        <span>For Agents</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-current" />
        </span>
      </Link>
    </div>
  );
}
