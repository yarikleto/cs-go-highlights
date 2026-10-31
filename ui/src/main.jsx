import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { HashRouter } from 'react-router-dom';
import App from './App';
import theme from './theme';
import { CommandProvider } from './context/CommandContext';
import { ViewerProvider } from './context/ViewerContext';
import { FilePickerProvider } from './context/FilePickerContext';
import { FlowRunProvider } from './context/FlowRunContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <FilePickerProvider>
        <CommandProvider>
          <FlowRunProvider>
            <ViewerProvider>
              <HashRouter>
                <App />
              </HashRouter>
            </ViewerProvider>
          </FlowRunProvider>
        </CommandProvider>
      </FilePickerProvider>
    </ThemeProvider>
  </React.StrictMode>
);
