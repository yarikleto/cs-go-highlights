import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { HashRouter } from 'react-router-dom';
import App from './App';
import theme from './theme';
import { CommandProvider } from './context/CommandContext';
import { ViewerProvider } from './context/ViewerContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CommandProvider>
        <ViewerProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ViewerProvider>
      </CommandProvider>
    </ThemeProvider>
  </React.StrictMode>
);
