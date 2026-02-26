"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const TERMS_ACCEPTED_KEY = "curyo_terms_accepted";
const TERMS_VERSION = "3.0";

export type ActionType = "faucet" | "vote" | "submit" | "claim" | "buy" | null;

interface TermsAcceptance {
  version: string;
  timestamp: number;
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
}

interface TermsAcceptanceContextType {
  isAccepted: boolean | null;
  showModal: boolean;
  pendingAction: ActionType;
  requireAcceptance: (actionName: ActionType) => Promise<boolean>;
  acceptTerms: () => void;
  closeModal: () => void;
}

const TermsAcceptanceContext = createContext<TermsAcceptanceContextType | null>(null);

export function TermsAcceptanceProvider({ children }: { children: React.ReactNode }) {
  const [isAccepted, setIsAccepted] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionType>(null);

  // Store resolve function for the pending promise
  const pendingResolveRef = useRef<((value: boolean) => void) | null>(null);

  // Check localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(TERMS_ACCEPTED_KEY);
    if (stored) {
      try {
        const acceptance: TermsAcceptance = JSON.parse(stored);
        if (acceptance.version === TERMS_VERSION && acceptance.termsAccepted) {
          setIsAccepted(true);
          return;
        }
      } catch {
        // Invalid stored data, require re-acceptance
      }
    }
    setIsAccepted(false);
  }, []);

  const requireAcceptance = useCallback(
    async (actionName: ActionType): Promise<boolean> => {
      // Already accepted
      if (isAccepted) return true;

      // Show modal and wait for acceptance
      setPendingAction(actionName);
      setShowModal(true);

      // Return promise that resolves when user accepts or closes
      return new Promise<boolean>(resolve => {
        pendingResolveRef.current = resolve;
      });
    },
    [isAccepted],
  );

  const acceptTerms = useCallback(() => {
    const acceptance: TermsAcceptance = {
      version: TERMS_VERSION,
      timestamp: Date.now(),
      termsAccepted: true,
      privacyAcknowledged: true,
    };
    localStorage.setItem(TERMS_ACCEPTED_KEY, JSON.stringify(acceptance));
    setIsAccepted(true);
    setShowModal(false);
    setPendingAction(null);

    // Resolve pending promise with true
    if (pendingResolveRef.current) {
      pendingResolveRef.current(true);
      pendingResolveRef.current = null;
    }
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setPendingAction(null);

    // Resolve pending promise with false
    if (pendingResolveRef.current) {
      pendingResolveRef.current(false);
      pendingResolveRef.current = null;
    }
  }, []);

  return (
    <TermsAcceptanceContext.Provider
      value={{
        isAccepted,
        showModal,
        pendingAction,
        requireAcceptance,
        acceptTerms,
        closeModal,
      }}
    >
      {children}
    </TermsAcceptanceContext.Provider>
  );
}

export function useTermsAcceptance() {
  const context = useContext(TermsAcceptanceContext);
  if (!context) {
    throw new Error("useTermsAcceptance must be used within TermsAcceptanceProvider");
  }
  return context;
}
