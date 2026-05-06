import Link from "next/link";
import styles from "./LandingPageActions.module.css";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { HumanSignInButton } from "~~/components/shared/HumanSignInButton";
import { DOCS_AI_ROUTE } from "~~/constants/routes";
import { HUMAN_SIGN_IN_LABEL } from "~~/lib/home/humanSignInRoute";

export function LandingPageActions() {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
      <HumanSignInButton className={`btn btn-primary ${styles.cta} ${styles.primary}`}>
        <span>{HUMAN_SIGN_IN_LABEL}</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-current" />
        </span>
      </HumanSignInButton>
      <Link href={DOCS_AI_ROUTE} prefetch={false} className={`btn whitespace-nowrap ${styles.cta} ${styles.secondary}`}>
        <span>For Agents</span>
        <span className={styles.arrow} aria-hidden="true">
          <ChevronRightIcon className="h-5 w-5 text-current" />
        </span>
      </Link>
    </div>
  );
}
