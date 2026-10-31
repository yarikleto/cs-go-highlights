import { useCallback, useState } from 'react';
import { api } from '../lib/api/client';
import { useFilePicker } from '../context/FilePickerContext';

export function formatApiError(error, fallback = 'Request failed') {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  return fallback;
}

export function useApi() {
  const [apiError, setApiError] = useState(null);
  const { pickPath } = useFilePicker();

  const clearApiError = useCallback(() => {
    setApiError(null);
  }, []);

  const getApi = useCallback(() => ({ ...api, pickPath }), [pickPath]);

  const handleApiError = useCallback((error, fallback) => {
    const message = formatApiError(error, fallback);
    setApiError(message);
    return message;
  }, []);

  const callApi = useCallback(async (action, fallback) => {
    try {
      clearApiError();
      return await action(getApi());
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
