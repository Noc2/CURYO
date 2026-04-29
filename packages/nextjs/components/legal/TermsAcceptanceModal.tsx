"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { ActionType, useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";

const ACTION_TEXT: Record<NonNullable<ActionType>, { title: string; intro: string }> = {
  faucet: {
    title: "Before You Claim Tokens",
    intro: "To claim HREP tokens from the faucet, please review and accept:",
  },
  vote: {
    title: "Before You Vote",
    intro: "To vote on content, please review and accept:",
  },
  submit: {
    title: "Before You Submit",
    intro: "To submit a question on Curyo, please review and accept:",
  },
  claim: {
    title: "Before You Claim Rewards",
    intro: "To claim your rewards, please review and accept:",
  },
  buy: {
    title: "Before You Participate",
    intro: "To participate in the HREP token distribution, please review and accept:",
  },
};

const DEFAULT_TEXT = {
  title: "Welcome to Curyo",
  intro: "Before continuing, please review and accept:",
};

export const TermsAcceptanceModal = () => {
  const { showModal, pendingAction, acceptTerms, closeModal } = useTermsAcceptance();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);

  if (!showModal) {
    return null;
  }

  const { title, intro } = pendingAction ? ACTION_TEXT[pendingAction] : DEFAULT_TEXT;
  const canAccept = termsAccepted && privacyAcknowledged;

  const handleAccept = () => {
    acceptTerms();
    // Reset local state for next time
    setTermsAccepted(false);
    setPrivacyAcknowledged(false);
  };

  const handleClose = () => {
    closeModal();
    // Reset local state
    setTermsAccepted(false);
    setPrivacyAcknowledged(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card bg-base-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="card-body">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            aria-label="Close"
          >
            x
          </button>

          <div className="flex items-center gap-3 mb-2">
            <ShieldCheckIcon className="w-8 h-8 text-primary" />
            <h2 className="card-title text-xl">{title}</h2>
          </div>

          <p className="text-base-content/70 text-base mb-4">{intro}</p>

          {/* Terms of Service */}
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-base-200 transition-colors">
            <input
              type="checkbox"
              className="checkbox checkbox-primary mt-0.5"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
            />
            <span className="text-base">
              I have read and agree to the{" "}
              <Link href="/legal/terms" target="_blank" className="link link-primary">
                Terms of Service
              </Link>
              .
            </span>
          </label>

          {/* Privacy Notice */}
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-base-200 transition-colors">
            <input
              type="checkbox"
              className="checkbox checkbox-primary mt-0.5"
              checked={privacyAcknowledged}
              onChange={e => setPrivacyAcknowledged(e.target.checked)}
            />
            <span className="text-base">
              I have read and acknowledge the{" "}
              <Link href="/legal/privacy" target="_blank" className="link link-primary">
                Privacy Notice
              </Link>
              .
            </span>
          </label>

          <div className="divider my-2"></div>

          {/* Info notice */}
          <div className="rounded-lg bg-warning/10 p-4 text-base text-base-content/60">
            <p className="leading-relaxed">
              <strong className="font-semibold text-base-content">Smart Contract Risk:</strong> Smart contracts may
              contain bugs or vulnerabilities. By proceeding, you acknowledge that you understand the risks and accept
              full responsibility for any losses.
            </p>
          </div>

          {/* Accept button */}
          <div className="card-actions justify-end mt-4">
            <button className="btn btn-ghost" onClick={handleClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!canAccept} onClick={handleAccept}>
              Accept &amp; Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
