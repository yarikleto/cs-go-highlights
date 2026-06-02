import React from 'react';
import { Alert, Box, Paper } from '@mui/material';

function getLogColor(type) {
  if (type === 'step-header') return '#64b5f6';
  if (type === 'stderr') return '#ff6b6b';
  return '#e0e0e0';
}

function defaultFormatResult(result) {
  if (result.success) return 'Completed successfully!';
  return result.error || 'Run failed';
}

function ExecutionOutput({
  result,
  logs = [],
  logsEndRef,
  formatResult = defaultFormatResult,
}) {
  return (
    <>
      {result && (
        <Alert
          severity={result.success ? 'success' : 'error'}
          sx={{ mb: 2 }}
        >
          {formatResult(result)}
        </Alert>
      )}

      {logs.length > 0 && (
        <Paper
          sx={{
            flex: 1,
            minHeight: 200,
            overflow: 'auto',
            bgcolor: '#0d0d0d',
            p: 2,
            fontFamily: 'monospace',
            fontSize: '0.85rem',
          }}
        >
          {logs.map((log, i) => (
            <Box
              key={i}
              component="pre"
              sx={{
                m: 0,
                color: getLogColor(log.type),
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontWeight: log.type === 'step-header' ? 'bold' : 'normal',
              }}
            >
              {log.text}
            </Box>
          ))}
          <div ref={logsEndRef} />
        </Paper>
      )}
    </>
  );
}

export default ExecutionOutput;
