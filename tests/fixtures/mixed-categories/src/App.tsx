import { Button, Text } from '@tui/components';           // design-system: TUI
import { PageLayout } from 'beaver-ui';                    // design-system: Beaver
import { SharedHeader } from '@shared/components';          // local-library
import { LocalCard } from './components/LocalCard';         // local
import DatePicker from 'react-datepicker';                  // third-party
import { Select } from './components';                      // local (barrel)

// Compound components
import * as Form from '@tui/components';

export const App = () => (
  <div>
    <header>
      <SharedHeader title="Dashboard" />
    </header>
    <PageLayout>
      <Form.Field label="Date">
        <DatePicker selected={null} onChange={() => {}} />
        <Text size="small">Pick a date</Text>
      </Form.Field>
      <LocalCard>
        <Button variant="primary" size="large" disabled>
          Submit
        </Button>
        <Select {...{ options: [] }} />
      </LocalCard>
    </PageLayout>
  </div>
);
