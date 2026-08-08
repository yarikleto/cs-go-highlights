import React from 'react';
import { Alert, Box } from '@mui/material';
import { tokens } from '../../theme/tokens';
import { sunkenSurface } from '../../theme/glass';
import { MONO_STACK } from '../../theme';

function getLogColor(type) {
  if (type === 'step-header') return tokens.accent;
  if (type === 'stderr') return tokens.status.error;
  return '#C3C9CE';
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
        <Box
          sx={{
            ...sunkenSurface({ deep: true }),
            flex: 1,
            minHeight: 220,
            overflow: 'auto',
            p: 2,
            fontFamily: MONO_STACK,
            fontSize: '0.8125rem',
            lineHeight: 1.55,
          }}
        >
          {logs.map((log, i) => (
            <Box
              key={i}
              component="pre"
              sx={{
                m: 0,
                fontFamily: 'inherit',
                fontSize: 'inherit',
                color: getLogColor(log.type),
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                fontWeight: log.type === 'step-header' ? 600 : 400,
              }}
            >
              {log.text}
            </Box>
          ))}
          <div ref={logsEndRef} />
        </Box>
      )}
    </>
  );
}

export default ExecutionOutput;
