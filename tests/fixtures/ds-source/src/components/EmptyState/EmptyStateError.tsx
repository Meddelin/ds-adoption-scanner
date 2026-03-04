import React from 'react';
import { EmptyState } from './EmptyState.js';

export function EmptyStateError() {
  return <EmptyState title="Something went wrong" description="Please try again later." />;
}
