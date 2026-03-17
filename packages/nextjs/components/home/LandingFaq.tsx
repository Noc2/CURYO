import Link from "next/link";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { landingFaqItems } from "~~/lib/docs/landingFaq";

export function LandingFaq() {
  return (
    <section className="w-full mt-14 sm:mt-16">
      <div className="mx-auto w-full max-w-4xl">
        <h2 className="display-section mb-4 text-center text-4xl text-base-content sm:text-5xl">FAQ</h2>

        <div className="mt-8 space-y-4">
          {landingFaqItems.map(item => (
            <details key={item.question} className="surface-card group overflow-hidden rounded-[1.5rem]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-left marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="text-lg font-semibold text-base-content sm:text-xl">{item.question}</span>
                <ChevronDownIcon className="h-5 w-5 shrink-0 text-base-content/50 transition-transform duration-200 group-open:rotate-180" />
              </summary>

              <div className="border-t border-white/6 px-6 pt-4 pb-6 text-base leading-7 text-base-content/65 sm:text-[1.05rem]">
                <p>{item.answer}</p>
                {item.learnMoreHref ? (
                  <Link
                    href={item.learnMoreHref}
                    className="mt-3 inline-flex text-sm font-medium text-primary transition-opacity hover:opacity-80"
                  >
                    Learn More: {item.learnMoreLabel}
                  </Link>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
