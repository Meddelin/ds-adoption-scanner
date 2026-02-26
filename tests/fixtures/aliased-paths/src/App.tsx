import { Button } from '@tui/components';
// Aliased local path — should resolve via tsconfig paths
import { Layout } from '@shared/Layout';

export const App = () => (
  <Layout>
    <Button variant="secondary">Save</Button>
  </Layout>
);
