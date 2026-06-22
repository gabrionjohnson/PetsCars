import React from 'react';
import { EmptyState } from './EmptyState';

interface ProGateProps {
  isPro: boolean;
  title: string;
  message: string;
  onUnlock: () => void;
  children: React.ReactNode;
}

export function ProGate({ isPro, title, message, onUnlock, children }: ProGateProps) {
  if (isPro) return <>{children}</>;
  return (
    <EmptyState title={title} message={message} actionLabel="Unlock Pro" onAction={onUnlock} />
  );
}
