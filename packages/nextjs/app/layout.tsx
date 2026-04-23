import { Bebas_Neue, Source_Sans_3 } from "next/font/google";
import Script from "next/script";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import "~~/styles/globals.css";
import "~~/styles/site-background.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Curyo — Human Reputation at Stake",
  description: "Human Reputation at Stake",
});

const isProduction = process.env.NODE_ENV === "production";

const sourceSans = Source_Sans_3({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-source-sans-3",
  weight: ["400", "500", "600", "700"],
});

const bebasNeue = Bebas_Neue({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  weight: "400",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${bebasNeue.variable}`}
      data-theme="dark"
      style={{ colorScheme: "dark" }}
    >
      <body suppressHydrationWarning>
        <ScaffoldEthAppWithProviders>
          <main id="main-content" className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden">
            {children}
          </main>
        </ScaffoldEthAppWithProviders>
        {isProduction ? <Script src="https://scripts.simpleanalyticscdn.com/latest.js" /> : null}
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
