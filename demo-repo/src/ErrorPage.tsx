import React from 'react';
import { EmptyStateError, EmptyState } from '@demo/ui';

export function ErrorPage() {
  return <EmptyStateError />;
}

export function NotFoundHelper() {
  return <EmptyState title="Custom empty" />;
}
