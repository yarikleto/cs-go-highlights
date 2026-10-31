import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../lib/api/client';

const CommandContext = createContext(null);

/**
 * Provider for command state persistence across page navigation
 */
export function CommandProvider({ children }) {
  // Store options per command: { [commandId]: { option1: value1, ... } }
  const [commandOptions, setCommandOptions] = useState({});
  
  // Store logs per command: { [commandId]: [{ type, text }, ...] }
  const [commandLogs, setCommandLogs] = useState({});
  
  // Store results per command: { [commandId]: { success, code, error } }
  const [commandResults, setCommandResults] = useState({});
  
  // Currently running command
  const [runningCommand, setRunningCommandState] = useState(null);
  const runningCommandRef = useRef(null);

  // The ref changes synchronously so events replayed right after a reload land on the right command.
  const setRunningCommand = useCallback((commandId) => {
    runningCommandRef.current = commandId;
    setRunningCommandState(commandId);
  }, []);

  // Get options for a specific command
  const getOptions = useCallback((commandId) => {
    return commandOptions[commandId] || {};
  }, [commandOptions]);

  // Set options for a specific command (replaces all options)
  const setOptions = useCallback((commandId, options) => {
    setCommandOptions((prev) => ({
      ...prev,
      [commandId]: options,
    }));
  }, []);

  // Initialize options with defaults (does not overwrite existing values)
  const initializeOptions = useCallback((commandId, defaults) => {
    setCommandOptions((prev) => {
      // If options already exist for this command, don't overwrite
      if (prev[commandId] && Object.keys(prev[commandId]).length > 0) {
        return prev;
      }
      return {
        ...prev,
        [commandId]: defaults,
      };
    });
  }, []);

  // Update a single option for a command
  const updateOption = useCallback((commandId, name, value) => {
    setCommandOptions((prev) => ({
      ...prev,
      [commandId]: {
        ...prev[commandId],
        [name]: value,
      },
    }));
  }, []);

  // Get logs for a specific command
  const getLogs = useCallback((commandId) => {
    return commandLogs[commandId] || [];
  }, [commandLogs]);

  // Add log entry for a command
  const addLog = useCallback((commandId, log) => {
    setCommandLogs((prev) => ({
      ...prev,
      [commandId]: [...(prev[commandId] || []), log],
    }));
  }, []);

  // Clear logs for a command
  const clearLogs = useCallback((commandId) => {
    setCommandLogs((prev) => ({
      ...prev,
      [commandId]: [],
    }));
    setCommandResults((prev) => ({
      ...prev,
      [commandId]: null,
    }));
  }, []);

  // Get result for a specific command
  const getResult = useCallback((commandId) => {
    return commandResults[commandId] || null;
  }, [commandResults]);

  // Set result for a command
  const setResult = useCallback((commandId, result) => {
    setCommandResults((prev) => ({
      ...prev,
      [commandId]: result,
    }));
  }, []);

  // Check if a specific command is running
  const isCommandRunning = useCallback((commandId) => {
    return runningCommand === commandId;
  }, [runningCommand]);

  useEffect(() => {
    const unsubscribes = [
      api.onJobState(({ kind, id }) => {
        if (kind === 'command' && runningCommandRef.current !== id) {
          clearLogs(id);
          setRunningCommand(id);
        } else if (kind === null && runningCommandRef.current) {
          setRunningCommand(null);
        }
      }),
      api.onCommandOutput((data) => {
        if (runningCommandRef.current) addLog(runningCommandRef.current, data);
      }),
      api.onCommandComplete((data) => {
        if (!runningCommandRef.current) return;
        setResult(runningCommandRef.current, data);
        setRunningCommand(null);
      }),
    ];

    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [addLog, clearLogs, setResult, setRunningCommand]);

  const value = {
    // Options
    getOptions,
    setOptions,
    initializeOptions,
    updateOption,
    
    // Logs
    getLogs,
    addLog,
    clearLogs,
    
    // Results
    getResult,
    setResult,
    
    // Running state
    runningCommand,
    setRunningCommand,
    isCommandRunning,
  };

  return (
    <CommandContext.Provider value={value}>
      {children}
    </CommandContext.Provider>
  );
}

/**
 * Hook to access command context
 */
export function useCommandContext() {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error('useCommandContext must be used within CommandProvider');
  }
  return context;
}
