"use client";

import * as React from "react";

import { useAppI18n } from "@/hooks/useAppI18n";

interface I18nReadyGateProps {
  children: React.ReactNode;
}

export function I18nReadyGate({ children }: I18nReadyGateProps): React.ReactElement {
  const { isReady } = useAppI18n();

  if (!isReady) {
    return <div className="min-h-screen" aria-hidden />;
  }

  return <>{children}</>;
}

