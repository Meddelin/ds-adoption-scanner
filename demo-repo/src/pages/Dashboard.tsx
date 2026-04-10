import React from 'react';
import { Button, Card, Table, Tag, Statistic, Row, Col } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { CustomCard } from '../components/CustomCard';
import { StatusBadge } from '../components/StatusBadge';

export default function Dashboard() {
  const data = [
    { key: '1', name: 'John', status: 'active', progress: 80 },
    { key: '2', name: 'Jane', status: 'inactive', progress: 45 },
  ];

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <StatusBadge status={s} /> },
    { title: 'Progress', dataIndex: 'progress', key: 'progress' },
  ];

  return (
    <div>
      <h1>Dashboard</h1>
      
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active Users"
              value={1128}
              prefix={<ArrowUpOutlined />}
              suffix="%"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Revenue"
              value={8930}
              prefix="$"
            />
          </Card>
        </Col>
      </Row>

      <Card title="User Table" style={{ marginTop: 16 }}>
        <Table dataSource={data} columns={columns} />
      </Card>

      <CustomCard title="Custom Component">
        <Button type="primary">Ant Design Button</Button>
        <Button>Default Button</Button>
        <Tag color="blue">Ant Tag</Tag>
      </CustomCard>
    </div>
  );
}
