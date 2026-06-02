import { useCallback, useState } from 'react';

export function formatElectronError(error, fallback = 'Electron action failed') {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  return fallback;
}

export function useElectronApi() {
  const [apiError, setApiError] = useState(null);

  const clearApiError = useCallback(() => {
    setApiError(null);
  }, []);

  const getApi = useCallback((fallback = 'Electron API is unavailable. Run this page in the Electron app.') => {
    const api = typeof window === 'undefined' ? null : window.electronAPI;

    if (!api) {
      setApiError(fallback);
      return null;
    }

    return api;
  }, []);

  const handleApiError = useCallback((error, fallback) => {
    const message = formatElectronError(error, fallback);
    setApiError(message);
    return message;
  }, []);

  const callApi = useCallback(async (action, fallback) => {
    const api = getApi();
    if (!api) return null;

    try {
      clearApiError();
      return await action(api);
    } catch (error) {
      handleApiError(error, fallback);
      return null;
    }
  }, [clearApiError, getApi, handleApiError]);

  return {
    apiError,
    setApiError,
    clearApiError,
    getApi,
    handleApiError,
    callApi,
  };
}
