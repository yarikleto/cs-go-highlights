import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowUpward as UpIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { api } from '../../lib/api/client';
import { joinSavePath, visibleEntries, withDefaultExtension } from '../../lib/filePicker';

const TITLES = Object.freeze({
  folder: 'Select folder',
  file: 'Select file',
  'save-file': 'Save as',
  files: 'Select files',
});

function lastPathSegment(filePath) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || '';
}

function FilePickerDialog({ request, onCancel, onConfirm }) {
  const { mode, filters, initialPath } = request;
  const extensions = filters.extensions || [];
  const [listing, setListing] = useState(null);
  const [pathInput, setPathInput] = useState(initialPath);
  const [roots, setRoots] = useState([]);
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const openDirectory = useCallback(async (directoryPath) => {
    try {
      const nextListing = await api.listDirectory(directoryPath);
      setListing(nextListing);
      setPathInput(nextListing.path);
      setSelectedPaths([]);
      setError('');
      return nextListing;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    openDirectory(initialPath).then((firstListing) => {
      if (mode === 'save-file' && firstListing && initialPath && initialPath !== firstListing.path) {
        setFileName(lastPathSegment(initialPath));
      }
    });
    api.listRoots().then(setRoots).catch(e => setError(e.message));
  }, [initialPath, mode, openDirectory]);

  const toggleFile = (filePath) => {
    if (mode === 'files') {
      setSelectedPaths(prev => (
        prev.includes(filePath) ? prev.filter(item => item !== filePath) : [...prev, filePath]
      ));
    } else {
      setSelectedPaths([filePath]);
    }
  };

  const handleEntryClick = (entry) => {
    if (entry.isDirectory) {
      openDirectory(entry.path);
    } else if (mode === 'save-file') {
      setFileName(entry.name);
    } else {
      toggleFile(entry.path);
    }
  };

  const confirmValue = () => {
    if (mode === 'folder') return listing.path;
    if (mode === 'files') return selectedPaths;
    if (mode === 'save-file') {
      return joinSavePath(listing.path, withDefaultExtension(fileName.trim(), extensions), listing.separator);
    }
    return selectedPaths[0];
  };

  const canConfirm = Boolean(listing) && (
    mode === 'folder'
    || (mode === 'save-file' && fileName.trim() !== '')
    || selectedPaths.length > 0
  );

  const entries = listing ? visibleEntries(listing.entries, { mode, extensions }) : [];
  const currentRoot = roots.find(root => listing?.path.startsWith(root.path))?.path || '';

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>{TITLES[mode]}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
          {roots.length > 1 && (
            <Select size="small" value={currentRoot} onChange={e => openDirectory(e.target.value)}>
              {roots.map(root => <MenuItem key={root.path} value={root.path}>{root.name}</MenuItem>)}
            </Select>
          )}
          <IconButton
            aria-label="Up one folder"
            disabled={!listing?.parent}
            onClick={() => openDirectory(listing.parent)}
          >
            <UpIcon />
          </IconButton>
          <TextField
            size="small"
            fullWidth
            label="Path"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') openDirectory(pathInput);
            }}
          />
        </Box>

        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
        {extensions.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {filters.name || 'Files'}: {extensions.map(extension => `*.${extension.replace(/^\./, '')}`).join(', ')}
          </Typography>
        )}

        <List dense sx={{ height: 360, overflow: 'auto' }}>
          {entries.map(entry => (
            <ListItemButton
              key={entry.path}
              selected={selectedPaths.includes(entry.path)}
              onClick={() => handleEntryClick(entry)}
              onDoubleClick={() => {
                if (!entry.isDirectory && mode === 'file') onConfirm(entry.path);
              }}
            >
              {mode === 'files' && !entry.isDirectory && (
                <Checkbox edge="start" size="small" tabIndex={-1} checked={selectedPaths.includes(entry.path)} />
              )}
              <ListItemIcon sx={{ minWidth: 32 }}>
                {entry.isDirectory ? <FolderIcon fontSize="small" /> : <FileIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText primary={entry.name} />
            </ListItemButton>
          ))}
          {listing && entries.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Nothing to show in this folder.
            </Typography>
          )}
        </List>

        {mode === 'save-file' && (
          <TextField
            size="small"
            fullWidth
            label="File name"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            sx={{ mt: 1.5 }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={!canConfirm} onClick={() => onConfirm(confirmValue())}>
          {mode === 'folder' ? 'Select this folder' : 'Select'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FilePickerDialog;
