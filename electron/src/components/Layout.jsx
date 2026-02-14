import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Collapse,
  AppBar,
  Toolbar,
  IconButton,
} from '@mui/material';
import {
  Home as HomeIcon,
  Settings as SettingsIcon,
  ExpandLess,
  ExpandMore,
  PlayArrow as PlayIcon,
  Build as BuildIcon,
  Movie as MovieIcon,
  MusicNote as MusicIcon,
  Merge as MergeIcon,
  Analytics as AnalyticsIcon,
  Speed as SpeedIcon,
  Compress as CompressIcon,
  Person as PersonIcon,
  People as PeopleIcon,
  Schedule as ScheduleIcon,
  Sync as SyncIcon,
  Visibility as ViewerIcon,
  QueueMusic as QueueMusicIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 280;

const COMMAND_ICONS = {
  'analyze-v2': AnalyticsIcon,
  'analyze-postprocess-ui': SpeedIcon,
  'analyze': AnalyticsIcon,
  'record': MovieIcon,
  'postprocess-ui': PlayIcon,
  'postprocess-sound': MusicIcon,
  'apply-music': QueueMusicIcon,
  'merge': MergeIcon,
  'top': AnalyticsIcon,
  'compress': CompressIcon,
  'players': PeopleIcon,
  'player-kills': PersonIcon,
  'timestamps': ScheduleIcon,
  'resync-music': SyncIcon,
  'merge-music': MusicIcon,
};

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [commands, setCommands] = useState([]);
  const [pipelineOpen, setPipelineOpen] = useState(true);
  const [utilityOpen, setUtilityOpen] = useState(true);

  useEffect(() => {
    // Load commands from main process
    if (window.electronAPI) {
      window.electronAPI.getCommands().then(setCommands);
    }
  }, []);

  const pipelineCommands = commands.filter(c => c.category === 'Pipeline');
  const utilityCommands = commands.filter(c => c.category === 'Utility');

  const isActive = (path) => location.pathname === path;
  const isCommandActive = (commandId) => location.pathname === `/command/${commandId}`;

  const CommandIcon = ({ commandId }) => {
    const Icon = COMMAND_ICONS[commandId] || BuildIcon;
    return <Icon />;
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'background.paper',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        {/* Logo / Title */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" fontWeight="bold" color="primary">
            CS:GO Highlights
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Video Production Tool
          </Typography>
        </Box>

        <List sx={{ flex: 1, overflow: 'auto' }}>
          {/* Home */}
          <ListItem disablePadding>
            <ListItemButton
              selected={isActive('/')}
              onClick={() => navigate('/')}
            >
              <ListItemIcon>
                <HomeIcon />
              </ListItemIcon>
              <ListItemText primary="Home" />
            </ListItemButton>
          </ListItem>

          {/* Highlights Viewer */}
          <ListItem disablePadding>
            <ListItemButton
              selected={isActive('/viewer')}
              onClick={() => navigate('/viewer')}
            >
              <ListItemIcon>
                <ViewerIcon />
              </ListItemIcon>
              <ListItemText primary="Highlights Viewer" />
            </ListItemButton>
          </ListItem>

          {/* Music Editor */}
          <ListItem disablePadding>
            <ListItemButton
              selected={isActive('/music-editor')}
              onClick={() => navigate('/music-editor')}
            >
              <ListItemIcon>
                <QueueMusicIcon />
              </ListItemIcon>
              <ListItemText primary="Music Editor" />
            </ListItemButton>
          </ListItem>

          <Divider sx={{ my: 1 }} />

          {/* Pipeline Commands */}
          <ListItem disablePadding>
            <ListItemButton onClick={() => setPipelineOpen(!pipelineOpen)}>
              <ListItemIcon>
                <PlayIcon />
              </ListItemIcon>
              <ListItemText primary="Pipeline" />
              {pipelineOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>
          </ListItem>
          <Collapse in={pipelineOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {pipelineCommands.map((cmd) => (
                <ListItem key={cmd.id} disablePadding>
                  <ListItemButton
                    sx={{ pl: 4 }}
                    selected={isCommandActive(cmd.id)}
                    onClick={() => navigate(`/command/${cmd.id}`)}
                  >
                    <ListItemIcon>
                      <CommandIcon commandId={cmd.id} />
                    </ListItemIcon>
                    <ListItemText 
                      primary={cmd.name} 
                      primaryTypographyProps={{ fontSize: '0.9rem' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Collapse>

          {/* Utility Commands */}
          <ListItem disablePadding>
            <ListItemButton onClick={() => setUtilityOpen(!utilityOpen)}>
              <ListItemIcon>
                <BuildIcon />
              </ListItemIcon>
              <ListItemText primary="Utility" />
              {utilityOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>
          </ListItem>
          <Collapse in={utilityOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {utilityCommands.map((cmd) => (
                <ListItem key={cmd.id} disablePadding>
                  <ListItemButton
                    sx={{ pl: 4 }}
                    selected={isCommandActive(cmd.id)}
                    onClick={() => navigate(`/command/${cmd.id}`)}
                  >
                    <ListItemIcon>
                      <CommandIcon commandId={cmd.id} />
                    </ListItemIcon>
                    <ListItemText 
                      primary={cmd.name}
                      primaryTypographyProps={{ fontSize: '0.9rem' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Collapse>

          <Divider sx={{ my: 1 }} />

          {/* Settings */}
          <ListItem disablePadding>
            <ListItemButton
              selected={isActive('/config')}
              onClick={() => navigate('/config')}
            >
              <ListItemIcon>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText primary="Global Config" />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default Layout;
