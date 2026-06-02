import React, { useMemo, useState } from 'react';
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
  TableSortLabel,
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
import { useViewerContext } from '../context/ViewerContext';
import {
  filterHighlights,
  formatDistanceMeters,
  formatDuration,
  formatKills,
  formatOptionalValue,
  formatRank,
  getHighlightsFileType,
  getUniqueHighlightMaps,
  getUniqueHighlightTypes,
  hasHighlightValue,
  hasValue,
  normalizeHighlights,
  sortHighlights,
} from '../lib/highlightsViewerData';

const TYPE_COLORS = {
  'kill-series': 'primary',
  'clutch': 'secondary',
  'collateral': 'warning',
  'knife': 'error',
  'one-tap': 'info',
};

function HighlightsViewer() {
  const {
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
  } = useViewerContext();

  const [loading, setLoading] = useState(false);

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

  const fileType = useMemo(
    () => data ? getHighlightsFileType(data) : null,
    [data]
  );
  const allHighlights = useMemo(() => normalizeHighlights(data), [data]);
  const uniqueTypes = useMemo(
    () => getUniqueHighlightTypes(allHighlights),
    [allHighlights]
  );
  const uniqueMaps = useMemo(
    () => getUniqueHighlightMaps(allHighlights),
    [allHighlights]
  );
  const hasDemos = Array.isArray(data?.demos);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  const filteredHighlights = useMemo(() => {
    const filtered = filterHighlights(allHighlights, {
      typeFilter,
      playerFilter,
      demoFilter,
      mapFilter,
    });

    return sortHighlights(filtered, sortBy, sortDir);
  }, [
    allHighlights,
    typeFilter,
    playerFilter,
    demoFilter,
    mapFilter,
    sortBy,
    sortDir,
  ]);
  const showRankColumn = useMemo(
    () => hasHighlightValue(filteredHighlights, 'rank'),
    [filteredHighlights]
  );
  const showPointsColumn = useMemo(
    () => hasHighlightValue(filteredHighlights, 'points'),
    [filteredHighlights]
  );

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
              <Typography variant="h5">{allHighlights.length}</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="caption" color="text.secondary">
                {hasDemos ? 'Demos' : 'Source'}
              </Typography>
              <Typography variant="h5">
                {hasDemos ? data.demos.length : data.sourceFile || '-'}
              </Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="caption" color="text.secondary">Filtered</Typography>
              <Typography variant="h5">{filteredHighlights.length}</Typography>
            </Grid>
            <Grid item xs={3}>
              <Typography variant="caption" color="text.secondary">
                {hasValue(data.topCount) ? 'Top Count' : 'Version'}
              </Typography>
              <Typography variant="h5">{data.topCount ?? data.version ?? '1'}</Typography>
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
                {uniqueTypes.map(type => (
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
            
            <FormControl sx={{ minWidth: 150 }}>
              <InputLabel>Map</InputLabel>
              <Select
                value={mapFilter}
                label="Map"
                onChange={(e) => setMapFilter(e.target.value)}
                size="small"
              >
                <MenuItem value="">All</MenuItem>
                {uniqueMaps.map(map => (
                  <MenuItem key={map} value={map}>{map}</MenuItem>
                ))}
              </Select>
            </FormControl>

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
              onClick={clearFilters}
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
                {showRankColumn && (
                  <TableCell sortDirection={sortBy === 'rank' ? sortDir : false}>
                    <TableSortLabel active={sortBy === 'rank'} direction={sortBy === 'rank' ? sortDir : 'asc'} onClick={() => handleSort('rank')}>
                      Rank
                    </TableSortLabel>
                  </TableCell>
                )}
                <TableCell sortDirection={sortBy === 'type' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'type'} direction={sortBy === 'type' ? sortDir : 'asc'} onClick={() => handleSort('type')}>
                    Type
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'player' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'player'} direction={sortBy === 'player' ? sortDir : 'asc'} onClick={() => handleSort('player')}>
                    Player
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'kills' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'kills'} direction={sortBy === 'kills' ? sortDir : 'asc'} onClick={() => handleSort('kills')}>
                    Kills
                  </TableSortLabel>
                </TableCell>
                {showPointsColumn && (
                  <TableCell sortDirection={sortBy === 'points' ? sortDir : false}>
                    <TableSortLabel active={sortBy === 'points'} direction={sortBy === 'points' ? sortDir : 'asc'} onClick={() => handleSort('points')}>
                      Points
                    </TableSortLabel>
                  </TableCell>
                )}
                <TableCell sortDirection={sortBy === 'duration' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'duration'} direction={sortBy === 'duration' ? sortDir : 'asc'} onClick={() => handleSort('duration')}>
                    Duration
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'map' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'map'} direction={sortBy === 'map' ? sortDir : 'asc'} onClick={() => handleSort('map')}>
                    Map
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'demo' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'demo'} direction={sortBy === 'demo' ? sortDir : 'asc'} onClick={() => handleSort('demo')}>
                    Demo
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortBy === 'tick' ? sortDir : false}>
                  <TableSortLabel active={sortBy === 'tick'} direction={sortBy === 'tick' ? sortDir : 'asc'} onClick={() => handleSort('tick')}>
                    Tick
                  </TableSortLabel>
                </TableCell>
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
                    {showRankColumn && (
                      <TableCell>
                        <Chip label={formatRank(h.rank)} size="small" color="success" />
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
                      <Tooltip title={hasValue(h.player?.steamId) ? String(h.player.steamId) : ''}>
                        <span>{h.player?.name || '-'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatKills(h)}</TableCell>
                    {showPointsColumn && (
                      <TableCell>
                        <Chip label={formatOptionalValue(h.points)} size="small" variant="outlined" />
                      </TableCell>
                    )}
                    <TableCell>{formatDuration(h.durationSeconds)}</TableCell>
                    <TableCell>
                      <Chip label={h.map || '?'} size="small" variant="outlined" />
                    </TableCell>
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
                              <Typography variant="body2">{formatOptionalValue(h.player?.steamId)}</Typography>
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
                                        {formatDistanceMeters(kill.distance)}
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
