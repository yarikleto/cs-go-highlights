import React, { createContext, useContext, useState, useCallback } from 'react';

const ViewerContext = createContext(null);

export function ViewerProvider({ children }) {
  const [filePath, setFilePath] = useState('./output/highlights.json');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [playerFilter, setPlayerFilter] = useState('');
  const [demoFilter, setDemoFilter] = useState('');
  const [mapFilter, setMapFilter] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState({});

  const clearFilters = useCallback(() => {
    setTypeFilter('');
    setPlayerFilter('');
    setDemoFilter('');
    setMapFilter('');
  }, []);

  const value = {
    filePath, setFilePath,
    data, setData,
    error, setError,
    typeFilter, setTypeFilter,
    playerFilter, setPlayerFilter,
    demoFilter, setDemoFilter,
    mapFilter, setMapFilter,
    sortBy, setSortBy,
    sortDir, setSortDir,
    expandedRows, setExpandedRows,
    clearFilters,
  };

  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewerContext() {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error('useViewerContext must be used within ViewerProvider');
  }
  return context;
}
