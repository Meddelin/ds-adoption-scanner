import { Button, Input } from '@tui/components';
import { PageLayout } from 'beaver-ui';
import { SharedLayout } from '@shared/components';
import { CustomCard } from './components/CustomCard';
import Select from 'react-select';

export const App = () => (
  <div>
    <SharedLayout>
      <PageLayout>
        <CustomCard>
          <Button variant="primary">OK</Button>
          <Input placeholder="..." />
          <Select options={[]} />
        </CustomCard>
      </PageLayout>
    </SharedLayout>
  </div>
);
