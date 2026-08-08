import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import AppBackdrop from './shell/AppBackdrop';
import TitleBar from './shell/TitleBar';
import Sidebar from './shell/Sidebar';
import { useCommandContext } from '../context/CommandContext';

function Layout({ children }) {
  const [commands, setCommands] = useState([]);
  const [flows, setFlows] = useState([]);
  const { runningCommand } = useCommandContext();

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getCommands().then(setCommands);
      window.electronAPI.getFlows().then(setFlows);
    }
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
