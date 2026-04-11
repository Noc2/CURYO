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
  mobileHeaderHeight: number;
  setIsMobileHeaderVisible: Dispatch<SetStateAction<boolean>>;
  setMobileHeaderHeight: Dispatch<SetStateAction<number>>;
  setMobileHeaderVoteControls: Dispatch<SetStateAction<ReactNode | null>>;
};

const MobileHeaderVisibilityContext = createContext<MobileHeaderVisibilityContextValue | null>(null);
const MobileHeaderVoteControlsContext = createContext<ReactNode | null>(null);

export function MobileHeaderVisibilityProvider({ children }: { children: ReactNode }) {
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState(0);
  const [mobileHeaderVoteControls, setMobileHeaderVoteControls] = useState<ReactNode | null>(null);
  const value = useMemo(
    () => ({
      isMobileHeaderVisible,
      mobileHeaderHeight,
      setIsMobileHeaderVisible,
      setMobileHeaderHeight,
      setMobileHeaderVoteControls,
    }),
    [
      isMobileHeaderVisible,
      mobileHeaderHeight,
      setIsMobileHeaderVisible,
      setMobileHeaderHeight,
      setMobileHeaderVoteControls,
    ],
  );

  return (
    <MobileHeaderVisibilityContext.Provider value={value}>
      <MobileHeaderVoteControlsContext.Provider value={mobileHeaderVoteControls}>
        {children}
      </MobileHeaderVoteControlsContext.Provider>
    </MobileHeaderVisibilityContext.Provider>
  );
}

export function useMobileHeaderVisibility() {
  const context = useContext(MobileHeaderVisibilityContext);

  if (!context) {
    throw new Error("useMobileHeaderVisibility must be used within MobileHeaderVisibilityProvider");
  }

  return context;
}

export function useMobileHeaderVoteControls() {
  return useContext(MobileHeaderVoteControlsContext);
}
