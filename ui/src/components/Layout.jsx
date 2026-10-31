import React, { useState, useEffect } from 'react';
import { Alert, Box } from '@mui/material';
import AppBackdrop from './shell/AppBackdrop';
import TitleBar from './shell/TitleBar';
import Sidebar from './shell/Sidebar';
import { useCommandContext } from '../context/CommandContext';
import { api } from '../lib/api/client';

function Layout({ children }) {
  const [commands, setCommands] = useState([]);
  const [flows, setFlows] = useState([]);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const { runningCommand } = useCommandContext();

  useEffect(() => api.onSessionExpired(() => setIsSessionExpired(true)), []);

  useEffect(() => {
    api.getCommands().then(setCommands).catch(error => console.error('Failed to load commands:', error));
    api.getFlows().then(setFlows).catch(error => console.error('Failed to load flows:', error));
  }, []);

  const runningLabel = runningCommand
    ? commands.find((c) => c.id === runningCommand)?.name || runningCommand
    : null;

  return (
    <>
      <AppBackdrop />
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
        }}
      >
        <TitleBar runningLabel={runningLabel} />
        {isSessionExpired && (
          <Alert severity="warning" square sx={{ flexShrink: 0 }}>
            Not signed in. The server was restarted or this tab is from an old session: open the URL printed by
            {' '}<code>csgo-highlights ui</code> in your terminal.
          </Alert>
        )}

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Sidebar commands={commands} flows={flows} />
          <Box component="main" sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            {children}
          </Box>
        </Box>
      </Box>
    </>
  );
}

export default Layout;
