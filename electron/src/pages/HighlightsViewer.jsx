import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  Grid,
  Tooltip,
} from '@mui/material';
import {
  FolderOpen as FolderIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

const TYPE_COLORS = {
  'kill-series': 'primary',
  'clutch': 'secondary',
  'collateral': 'warning',
  'knife': 'error',
  'one-tap': 'info',
};

function HighlightsViewer() {
  const [filePath, setFilePath] = useState('./output/highlights.json');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [playerFilter, setPlayerFilter] = useState('');
  const [demoFilter, setDemoFilter] = useState('');
  
  // Expanded rows
  const [expandedRows, setExpandedRows] = useState({});

  const loadFile = async () => {
    if (!filePath) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use IPC to read file
      const content = await window.electronAPI.readFile(filePath);
      const parsed = JSON.parse(content);
      setData(parsed);
    } catch (e) {
      setError(`Failed to load file: ${e.message}`);
      setData(null);
    }
    
    setLoading(false);
  };

  const handleSelectFile = async () => {
    const path = await window.electronAPI.selectFile({ 
      name: 'JSON', 
      extensions: ['json'] 
    });
    if (path) {
      setFilePath(path);
    }
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Detect file type
  const getFileType = () => {
    if (data?.fileType) return data.fileType;
    // Fallback detection for older files
    if (data?.topCount) return 'highlights-top';
    if (data?.postprocessedAt) return 'highlights-postprocess';
    if (data?.demos) return 'highlights';
    return 'unknown';
  };

  const fileType = data ? getFileType() : null;

  // Get all highlights from different formats
  const getAllHighlights = () => {
    if (!data) return [];
    
    const highlights = [];
    
    // Format with flat highlights array (top, postprocess with demos)
    if (data.fileType === 'highlights-top' || 
        (data.highlights && Array.isArray(data.highlights) && !data.demos)) {
      data.highlights.forEach(h => {
        highlights.push({
          ...h,
          demoFile: h.demoFile,
          map: h.map,
        });
      });
    }
    // Format with demos[].highlights[] (highlights, postprocess)
    else if (data.demos && Array.isArray(data.demos)) {
      data.demos.forEach(demo => {
        demo.highlights?.forEach(h => {
          highlights.push({
            ...h,
            demoFile: demo.file || h.demoFile,
            map: demo.map,
          });
        });
      });
    }
    
    return highlights;
  };

  // Apply filters
  const getFilteredHighlights = () => {
    let highlights = getAllHighlights();
    
    if (typeFilter) {
      highlights = highlights.filter(h => h.type === typeFilter);
    }
    if (playerFilter) {
      highlights = highlights.filter(h => 
        h.player?.name?.toLowerCase().includes(playerFilter.toLowerCase()) ||
        h.player?.steamId?.includes(playerFilter)
      );
    }
    if (demoFilter) {
      highlights = highlights.filter(h => 
        h.demoFile?.toLowerCase().includes(demoFilter.toLowerCase())
      );
    }
    
    return highlights;
  };

  // Get unique values for filters
  const getUniqueTypes = () => {
    const types = new Set(getAllHighlights().map(h => h.type));
    return Array.from(types);
  };

  const filteredHighlights = getFilteredHighlights();

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    return `${seconds.toFixed(1)}s`;
  };

  const formatKills = (highlight) => {
    if (highlight.killCount) return highlight.killCount;
    if (highlight.kills?.length) return highlight.kills.length;
    return '-';
  };

  return (
    <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Highlights Viewer
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Browse and analyze detected highlights from highlights.json
        </Typography>
      </Box>

      {/* File Selection */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            label="Highlights File"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={handleSelectFile}>
                    <FolderIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            onClick={loadFile}
            disabled={loading}
            startIcon={<RefreshIcon />}
          >
            {loading ? 'Loading...' : 'Load'}
          </Button>
        </Box>
        
        {error && (
          <Typography color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </Paper>

      {/* Summary */}
      {data && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="subtitle2">File Type:</Typography>
            <Chip 
              label={fileType} 
              color={
                fileType === 'highlights' ? 'primary' :
                fileType === 'highlights-top' ? 'success' :
                fileType === 'highlights-postprocess' ? 'info' : 'default'
              }
              size="small"
            />
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={3}>
              <Typography variant="caption" color="text.secondary">Total Highlights</Typography>
              <Typography variant="h5">{getAllHighlights().length}</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="caption" color="text.secondary">
                {data.demos ? 'Demos' : 'Source'}
              </Typography>
              <Typography variant="h5">
                {data.demos?.length || data.sourceFile || '-'}
              </Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="caption" color="text.secondary">Filtered</Typography>
              <Typography variant="h5">{filteredHighlights.length}</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="caption" color="text.secondary">
                {data.topCount ? 'Top Count' : 'Version'}
              </Typography>
              <Typography variant="h5">{data.topCount || data.version || '1'}</Typography>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Filters */}
      {data && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>Filters</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={typeFilter}
                label="Type"
                onChange={(e) => setTypeFilter(e.target.value)}
                size="small"
              >
                <MenuItem value="">All</MenuItem>
                {getUniqueTypes().map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              label="Player"
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value)}
              size="small"
              placeholder="Name or Steam ID"
            />
            
            <TextField
              label="Demo"
              value={demoFilter}
              onChange={(e) => setDemoFilter(e.target.value)}
              size="small"
              placeholder="Demo filename"
            />
            
            <Button 
              variant="outlined" 
              size="small"
              onClick={() => {
                setTypeFilter('');
                setPlayerFilter('');
                setDemoFilter('');
              }}
            >
              Clear
            </Button>
          </Box>
        </Paper>
      )}

      {/* Highlights Table */}
      {data && (
        <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40}></TableCell>
                {filteredHighlights.some(h => h.rank) && <TableCell>Rank</TableCell>}
                <TableCell>Type</TableCell>
                <TableCell>Player</TableCell>
                <TableCell>Kills</TableCell>
                {filteredHighlights.some(h => h.points) && <TableCell>Points</TableCell>}
                <TableCell>Duration</TableCell>
                <TableCell>Demo</TableCell>
                <TableCell>Tick</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredHighlights.map((h) => (
                <React.Fragment key={h.id}>
                  <TableRow 
                    hover 
                    sx={{ cursor: 'pointer' }}
                    onClick={() => toggleRow(h.id)}
                  >
                    <TableCell>
                      <IconButton size="small">
                        {expandedRows[h.id] ? <CollapseIcon /> : <ExpandIcon />}
                      </IconButton>
                    </TableCell>
                    {filteredHighlights.some(hh => hh.rank) && (
                      <TableCell>
                        <Chip label={`#${h.rank}`} size="small" color="success" />
                      </TableCell>
                    )}
                    <TableCell>
                      <Chip 
                        label={h.type} 
                        size="small" 
                        color={TYPE_COLORS[h.type] || 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={h.player?.steamId || ''}>
                        <span>{h.player?.name || '-'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatKills(h)}</TableCell>
                    {filteredHighlights.some(hh => hh.points) && (
                      <TableCell>
                        <Chip label={h.points} size="small" variant="outlined" />
                      </TableCell>
                    )}
                    <TableCell>{formatDuration(h.durationSeconds)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ 
                        maxWidth: 200, 
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {h.demoFile}
                      </Typography>
                    </TableCell>
                    <TableCell>{h.startTick}</TableCell>
                  </TableRow>
                  
                  {/* Expanded Details */}
                  <TableRow>
                    <TableCell colSpan={12} sx={{ p: 0 }}>
                      <Collapse in={expandedRows[h.id]} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
                          <Grid container spacing={2}>
                            <Grid item xs={12}>
                              <Typography variant="subtitle2" gutterBottom>
                                Highlight Details
                              </Typography>
                            </Grid>
                            
                            {/* Basic Info */}
                            <Grid item xs={3}>
                              <Typography variant="caption" color="text.secondary">ID</Typography>
                              <Typography variant="body2">{h.id}</Typography>
                            </Grid>
                            <Grid item xs={3}>
                              <Typography variant="caption" color="text.secondary">Steam ID</Typography>
                              <Typography variant="body2">{h.player?.steamId || '-'}</Typography>
                            </Grid>
                            <Grid item xs={3}>
                              <Typography variant="caption" color="text.secondary">Priority</Typography>
                              <Typography variant="body2">{h.priority}</Typography>
                            </Grid>
                            <Grid item xs={3}>
                              <Typography variant="caption" color="text.secondary">Ticks</Typography>
                              <Typography variant="body2">{h.startTick} - {h.endTick}</Typography>
                            </Grid>
                            
                            {/* Clutch specific */}
                            {h.type === 'clutch' && (
                              <Grid item xs={3}>
                                <Typography variant="caption" color="text.secondary">Enemies</Typography>
                                <Typography variant="body2">1v{h.enemies}</Typography>
                              </Grid>
                            )}
                            
                            {/* Kills */}
                            {h.kills?.length > 0 && (
                              <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">Kills</Typography>
                                <Box sx={{ mt: 1 }}>
                                  {h.kills.map((kill, i) => (
                                    <Box 
                                      key={i} 
                                      sx={{ 
                                        display: 'flex', 
                                        gap: 1, 
                                        mb: 0.5,
                                        alignItems: 'center',
                                      }}
                                    >
                                      <Chip label={kill.weapon} size="small" variant="outlined" />
                                      {kill.headshot && <Chip label="HS" size="small" color="error" />}
                                      {kill.noscope && <Chip label="NS" size="small" color="warning" />}
                                      {kill.penetrated > 0 && <Chip label="WB" size="small" color="info" />}
                                      {kill.thrusmoke && <Chip label="Smoke" size="small" />}
                                      {kill.attackerblind && <Chip label="Blind" size="small" />}
                                      {kill.airborne && <Chip label="Air" size="small" color="secondary" />}
                                      {kill.isFlick && <Chip label={`Flick ${kill.flickAngle}°`} size="small" color="primary" />}
                                      <Typography variant="caption" color="text.secondary">
                                        {kill.distance?.toFixed(1)}m
                                      </Typography>
                                    </Box>
                                  ))}
                                </Box>
                              </Grid>
                            )}
                            
                            {/* Playback info */}
                            {h.playback && (
                              <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary">Playback</Typography>
                                <Typography variant="body2">
                                  {h.playback.startTick} - {h.playback.endTick} 
                                  ({formatDuration(h.playback.durationSeconds)})
                                  {h.playback.speedupSegments?.length > 0 && 
                                    ` | ${h.playback.speedupSegments.length} speedup segments`}
                                  {h.playback.slowmotion && ' | slowmo'}
                                </Typography>
                              </Grid>
                            )}
                          </Grid>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Empty State */}
      {!data && !loading && !error && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Select a highlights.json file and click Load to view highlights
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

export default HighlightsViewer;
