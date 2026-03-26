import Link from "next/link";
import type { NextPage } from "next";
import { DocumentTextIcon, IdentificationIcon, LockClosedIcon } from "@heroicons/react/24/outline";

const LegalPage: NextPage = () => {
  const legalPages = [
    {
      title: "Terms of Service",
      description: "Rules and conditions for using cREP",
      href: "/legal/terms",
      icon: DocumentTextIcon,
    },
    {
      title: "Privacy Notice",
      description: "How we handle your information",
      href: "/legal/privacy",
      icon: LockClosedIcon,
    },
    {
      title: "Imprint",
      description: "Operator information (Impressum)",
      href: "/legal/imprint",
      icon: IdentificationIcon,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Legal</h1>
      <p className="mb-8 text-base-content/75">Legal documents and disclosures for cREP.</p>

      <div className="grid gap-4 md:grid-cols-3">
        {legalPages.map(page => (
          <Link
            key={page.href}
            href={page.href}
            className="card bg-base-200 shadow-md hover:shadow-lg transition-shadow"
          >
            <div className="card-body">
              <page.icon className="w-8 h-8 text-primary mb-2" />
              <h2 className="card-title text-lg">{page.title}</h2>
              <p className="text-base text-base-content/75">{page.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 p-4 bg-base-200 rounded-lg">
        <p className="text-base text-base-content/70">
          Last updated: February 2026. These documents may be updated from time to time. Material changes will require
          re-acceptance through the Terms modal. Continued use of Curyo constitutes acceptance of any changes.
        </p>
      </div>
    </div>
  );
};

export default LegalPage;
