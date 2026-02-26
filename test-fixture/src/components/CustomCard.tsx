import React from 'react';
import { Card } from '@tui/components';

interface CustomCardProps {
  children: React.ReactNode;
}

export const CustomCard = ({ children }: CustomCardProps) => (
  <Card className="custom-card">
    <div className="custom-card-body">
      {children}
    </div>
  </Card>
);
