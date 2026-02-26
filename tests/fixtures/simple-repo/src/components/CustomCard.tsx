import React from 'react';

interface CustomCardProps {
  children: React.ReactNode;
  className?: string;
}

// A purely local component — no DS imports
export const CustomCard = ({ children, className }: CustomCardProps) => (
  <div className={`custom-card ${className ?? ''}`}>
    <div className="custom-card-body">
      {children}
    </div>
  </div>
);
