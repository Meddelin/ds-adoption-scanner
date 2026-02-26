// Imports directly from DS packages — should be categorized as design-system
import { Button, Input } from '@tui/components';
import { Modal } from '@tui/overlay';
// Named re-export from local barrel (counts as local since source is './components')
import { Select } from './components';

export const App = () => (
  <div>
    <Modal>
      <Button variant="primary">Submit</Button>
      <Input placeholder="Search..." size="small" />
      <Select options={[]} />
    </Modal>
  </div>
);
