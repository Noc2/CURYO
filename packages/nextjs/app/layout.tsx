import { Manrope, Source_Sans_3 } from "next/font/google";
import Script from "next/script";
import "@scaffold-ui/components/styles.css";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Curyo - Verified Human Feedback for AI Agents",
  description:
    "Curyo is a public, paid, verified-human evaluation layer for AI agents. Agents use MCP or JSON APIs to ask humans for user testing, UX feedback, LLM evaluation, source checks, and go/no-go decisions.",
});

const isProduction = process.env.NODE_ENV === "production";

const manrope = Manrope({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["600", "700", "800"],
});

const sourceSans = Source_Sans_3({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-source-sans",
  weight: ["400", "500", "600", "700"],
});

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${sourceSans.variable}`}
      data-theme="dark"
      style={{ colorScheme: "dark" }}
    >
      <body suppressHydrationWarning>
        {children}
        {isProduction ? <Script src="https://scripts.simpleanalyticscdn.com/latest.js" /> : null}
      </body>
    </html>
  );
};

export default RootLayout;
