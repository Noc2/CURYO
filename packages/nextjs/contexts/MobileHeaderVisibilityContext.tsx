"use client";

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

type MobileHeaderVisibilityContextValue = {
  isMobileHeaderVisible: boolean;
  setIsMobileHeaderVisible: Dispatch<SetStateAction<boolean>>;
};

const MobileHeaderVisibilityContext = createContext<MobileHeaderVisibilityContextValue | null>(null);

export function MobileHeaderVisibilityProvider({ children }: { children: ReactNode }) {
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const value = useMemo(
    () => ({ isMobileHeaderVisible, setIsMobileHeaderVisible }),
    [isMobileHeaderVisible, setIsMobileHeaderVisible],
  );

  return <MobileHeaderVisibilityContext.Provider value={value}>{children}</MobileHeaderVisibilityContext.Provider>;
}

export function useMobileHeaderVisibility() {
  const context = useContext(MobileHeaderVisibilityContext);

  if (!context) {
    throw new Error("useMobileHeaderVisibility must be used within MobileHeaderVisibilityProvider");
  }

  return context;
}
