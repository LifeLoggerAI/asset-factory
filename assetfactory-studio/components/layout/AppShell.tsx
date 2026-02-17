
import React from 'react';
import { Flex, Box, Text, Heading, Button } from '@radix-ui/themes';

const AppShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <Flex direction="row" style={{ height: '100vh' }}>
      {/* Sidebar Navigation */}
      <Box width="256px" style={{ flexShrink: 0, backgroundColor: 'var(--gray-2)', padding: 'var(--space-4)' }}>
        <Heading size="6" mb="6">Asset Factory</Heading>
        <Flex direction="column" asChild>
          <nav>
            <ul>
              <li style={{ marginBottom: 'var(--space-3)' }}><a href="/"><Text>Dashboard</Text></a></li>
              <li style={{ marginBottom: 'var(--space-3)' }}><a href="/jobs"><Text>Jobs</Text></a></li>
              <li style={{ marginBottom: 'var(--space-3)' }}><a href="/billing"><Text>Billing</Text></a></li>
              <li style={{ marginBottom: 'var(--space-3)' }}><a href="/settings"><Text>Settings</Text></a></li>
              <li style={{ marginBottom: 'var(--space-3)' }}><a href="/docs"><Text>Docs</Text></a></li>
            </ul>
          </nav>
        </Flex>
        <Box style={{ marginTop: 'auto' }}>
          <Button onClick={() => window.location.href = '/jobs/new'}>New Job</Button>
        </Box>
      </Box>

      <Flex direction="column" style={{ flexGrow: 1 }}>
        {/* Top Status Bar */}
        <Box style={{ backgroundColor: 'var(--gray-2)', padding: 'var(--space-3)', borderBottom: '1px solid var(--gray-5)' }}>
          <Flex justify="between" align="center">
            <Flex gap="4" align="center">
              <Text weight="bold">User Tier:</Text> <Text color="blue">Pro</Text>
            </Flex>
            <Button color="red" variant="soft">Logout</Button>
          </Flex>
        </Box>

        {/* Main Content */}
        <Box style={{ flexGrow: 1, padding: 'var(--space-6)', overflowY: 'auto' }}>
          {children}
        </Box>
      </Flex>
    </Flex>
  );
};

export default AppShell;
