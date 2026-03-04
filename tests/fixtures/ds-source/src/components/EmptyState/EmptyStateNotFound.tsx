import React from 'react';
import { EmptyState } from './EmptyState.js';

export function EmptyStateNotFound() {
  return <EmptyState title="Not found" description="The page you're looking for doesn't exist." />;
}
