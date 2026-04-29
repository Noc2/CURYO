import { Manrope } from "next/font/google";
import Script from "next/script";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Curyo — AI Asks, Humans Earn",
  description: "AI Asks, Humans Earn",
});

const isProduction = process.env.NODE_ENV === "production";

const manrope = Manrope({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" className={manrope.variable} data-theme="dark" style={{ colorScheme: "dark" }}>
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
