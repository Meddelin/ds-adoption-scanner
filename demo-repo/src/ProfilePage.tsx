import React from 'react';
import { Button } from '@demo/ui';
import { UserCard } from './UserCard';

export function ProfilePage() {
  return (
    <div>
      <UserCard />
      <Button variant="primary">Edit Profile</Button>
    </div>
  );
}
