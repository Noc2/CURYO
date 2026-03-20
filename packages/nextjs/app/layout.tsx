import Script from "next/script";
import "@fontsource/bebas-neue/latin-400.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import "~~/styles/globals.css";
import "~~/styles/site-background.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Curyo — A Better Web, Guided by Human Reputation",
  description: "A Better Web, Guided by Human Reputation.",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html data-theme="dark" style={{ colorScheme: "dark" }}>
      <body>
        <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        <Script src="https://scripts.simpleanalyticscdn.com/latest.js" />
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
