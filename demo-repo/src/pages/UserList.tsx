import React from 'react';
import { List, Avatar, Button, Tag, Pagination } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { UserCard } from '../components/UserCard';
import { StatusBadge } from '../components/StatusBadge';

const users = [
  { id: 1, name: 'John Doe', email: 'john@example.com', role: 'admin' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'user' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', role: 'user' },
];

export default function UserList() {
  return (
    <div>
      <h1>User List</h1>
      
      <List
        itemLayout="horizontal"
        dataSource={users}
        renderItem={user => (
          <List.Item
            actions={[
              <Button type="link">Edit</Button>,
              <Button type="link" danger>Delete</Button>,
            ]}
          >
            <List.Item.Meta
              avatar={<Avatar icon={<UserOutlined />} />}
              title={user.name}
              description={user.email}
            />
            <div>
              <Tag color={user.role === 'admin' ? 'red' : 'blue'}>{user.role}</Tag>
              <StatusBadge status="active" />
            </div>
          </List.Item>
        )}
      />

      <Pagination total={50} pageSize={10} style={{ marginTop: 16 }} />

      {users.map(u => (
        <UserCard key={u.id} user={u} />
      ))}
    </div>
  );
}
