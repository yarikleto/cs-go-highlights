import React, { createContext, useCallback, useContext, useState } from 'react';
import FilePickerDialog from '../components/filePicker/FilePickerDialog';

const FilePickerContext = createContext(null);

export function FilePickerProvider({ children }) {
  const [pending, setPending] = useState(null);

  const pickPath = useCallback(({ mode, filters = {}, initialPath = '' }) => (
    new Promise((resolve) => {
      setPending({ request: { mode, filters: filters || {}, initialPath: initialPath || '' }, resolve });
    })
  ), []);

  const settle = (value) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <FilePickerContext.Provider value={{ pickPath }}>
      {children}
      {pending && (
        <FilePickerDialog
          request={pending.request}
          onCancel={() => settle(null)}
          onConfirm={settle}
        />
      )}
    </FilePickerContext.Provider>
  );
}

export function useFilePicker() {
  const context = useContext(FilePickerContext);
  if (!context) {
    throw new Error('useFilePicker must be used within a FilePickerProvider');
  }
  return context;
}
