"use client";

import { createContext, useContext, useEffect } from "react";

type ThemeName = "dark";

export type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: ThemeName;
  forcedTheme?: ThemeName;
};

type ThemeContextValue = {
  forcedTheme?: ThemeName;
  resolvedTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  theme: ThemeName;
  themes: ThemeName[];
};

const ThemeContext = createContext<ThemeContextValue>({
  resolvedTheme: "dark",
  setTheme: () => {},
  theme: "dark",
  themes: ["dark"],
});

export const ThemeProvider = ({ children, defaultTheme = "dark", forcedTheme }: ThemeProviderProps) => {
  const theme = forcedTheme ?? defaultTheme;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        forcedTheme,
        resolvedTheme: theme,
        setTheme: () => {},
        theme,
        themes: [theme],
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
