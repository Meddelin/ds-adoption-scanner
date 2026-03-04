import React from 'react';
import { Button, ButtonGroup } from '@demo/ui';

export function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <ButtonGroup>
        <Button variant="primary">Save</Button>
        <Button variant="secondary">Cancel</Button>
      </ButtonGroup>
    </div>
  );
}
