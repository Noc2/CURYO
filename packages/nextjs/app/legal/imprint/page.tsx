import Link from "next/link";
import type { NextPage } from "next";

const ImprintPage: NextPage = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/legal" className="link link-primary text-base mb-4 inline-block">
        &larr; Back to Legal
      </Link>

      <article className="prose prose-sm max-w-none">
        <h1>Imprint (Impressum)</h1>
        <p className="text-base-content/60">Information pursuant to &sect; 5 DDG (German Digital Services Act)</p>

        <h2>Interface Operator</h2>
        <p>
          Hawig Ventures UG (haftungsbeschr&auml;nkt)
          <br />
          Herzogin-Juliana-Stra&szlig;e 7<br />
          55469 Simmern
          <br />
          Germany
        </p>

        <h2>Represented by</h2>
        <p>Gesch&auml;ftsf&uuml;hrer: David Hawig</p>

        <h2>Contact</h2>
        <p>Email: hawigxyz@proton.me</p>

        <h2>Responsible for Content</h2>
        <p>
          Responsible pursuant to &sect; 18 para. 2 MStV (German Interstate Media Treaty):
          <br />
          David Hawig
          <br />
          Herzogin-Juliana-Stra&szlig;e 7<br />
          55469 Simmern
          <br />
          Germany
        </p>

        <h2>Important Notice</h2>
        <p>
          This Imprint applies solely to this Interface (the website). The Curyo Protocol is a set of decentralized,
          autonomous smart contracts deployed on public blockchains. The Protocol operates independently and is not
          controlled, operated, or maintained by Hawig Ventures UG.
        </p>

        <h2>Dispute Resolution</h2>
        <p>
          The former European Commission Online Dispute Resolution (ODR) platform was discontinued on July 20, 2025.
          Further information is available from the European Commission:{" "}
          <a href="https://consumer-redress.ec.europa.eu/site-relocation_en" target="_blank" rel="noopener noreferrer">
            consumer-redress.ec.europa.eu/site-relocation_en
          </a>
        </p>
        <p>
          We are neither obligated nor willing to participate in dispute resolution proceedings before a consumer
          arbitration board.
        </p>
      </article>
    </div>
  );
};

export default ImprintPage;
