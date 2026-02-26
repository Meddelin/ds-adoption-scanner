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

// Expected counts:
// DS(TUI)=2 (Button, Input), DS(Beaver)=1 (PageLayout)
// local-library=1 (SharedLayout), local=1 (CustomCard)
// third-party=1 (Select), html-native=1 (div)
// Total DS=3, denominator=3+1+1=5
// Adoption: 3/5 = 60%
// TUI adoption: 2/5 = 40%, Beaver adoption: 1/5 = 20%
