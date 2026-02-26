import * as DS from '@tui/components';
import * as Icons from '@tui/icons';
import React from 'react';

// Namespace import — member expression usage
export const App = () => (
  <div>
    <DS.Button variant="primary">Click me</DS.Button>
    <DS.Input placeholder="Type here" />
    <DS.Select.Option value="a">Option A</DS.Select.Option>
    <Icons.SearchIcon size={24} />
  </div>
);
