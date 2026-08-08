import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, ButtonBase, Collapse, Typography } from '@mui/material';
import {
  Home as HomeIcon,
  Settings as SettingsIcon,
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
  RocketLaunch as FlowIcon,
} from '@mui/icons-material';
import { tokens, transition } from '../../theme/tokens';

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

function NavItem({ icon: Icon, label, active, onClick, dense = false }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        textAlign: 'left',
        gap: 1.25,
        px: 1.25,
        py: dense ? 0.625 : 0.875,
        borderRadius: `${tokens.radius.sm}px`,
        color: active ? tokens.accent : tokens.text.secondary,
        background: active ? tokens.accentSoft : 'transparent',
        transition: transition(),
        '&:hover': {
          background: active ? tokens.accentSoft : tokens.surface.glassLo,
          color: active ? tokens.accent : tokens.text.primary,
        },
      }}
    >
      <Icon sx={{ fontSize: dense ? 17 : 19, flexShrink: 0 }} />
      <Typography
        noWrap
        sx={{
          minWidth: 0,
          fontSize: dense ? '0.8125rem' : '0.875rem',
          fontWeight: active ? 600 : 450,
          letterSpacing: '-0.005em',
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

function SectionHeader({ label, open, onToggle }) {
  return (
    <ButtonBase
      onClick={onToggle}
      sx={{
        width: '100%',
        justifyContent: 'space-between',
        px: 1.25,
        py: 0.75,
        mt: 1.75,
        mb: 0.25,
        borderRadius: `${tokens.radius.sm - 2}px`,
        '&:hover': { background: tokens.surface.glassLo },
      }}
    >
      <Typography
        sx={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: tokens.text.disabled,
        }}
      >
        {label}
      </Typography>
      <ExpandMore
        sx={{
          fontSize: 15,
          color: tokens.text.disabled,
          transform: open ? 'none' : 'rotate(-90deg)',
          transition: transition(['transform']),
        }}
      />
    </ButtonBase>
  );
}

function Sidebar({ commands, flows }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [flowsOpen, setFlowsOpen] = useState(true);
  const [pipelineOpen, setPipelineOpen] = useState(true);
  const [utilityOpen, setUtilityOpen] = useState(true);

  const pipelineCommands = commands.filter((c) => c.category === 'Pipeline');
  const utilityCommands = commands.filter((c) => c.category === 'Utility');

  const isActive = (path) => location.pathname === path;

  const commandItems = (list) =>
    list.map((cmd) => (
      <NavItem
        key={cmd.id}
        dense
        icon={COMMAND_ICONS[cmd.id] || BuildIcon}
        label={cmd.name}
        active={location.pathname === `/command/${cmd.id}`}
        onClick={() => navigate(`/command/${cmd.id}`)}
      />
    ));

  return (
    <Box
      component="nav"
      sx={{
        position: 'relative',
        zIndex: 2,
        width: tokens.sidebarWidth,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: tokens.surface.glass,
        backdropFilter: tokens.blur.panel,
        WebkitBackdropFilter: tokens.blur.panel,
        borderRight: `1px solid ${tokens.hairline}`,
      }}
    >
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.25, py: 1.25, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <NavItem icon={HomeIcon} label="Home" active={isActive('/')} onClick={() => navigate('/')} />
        <NavItem
          icon={ViewerIcon}
          label="Highlights Viewer"
          active={isActive('/viewer')}
          onClick={() => navigate('/viewer')}
        />
        <NavItem
          icon={QueueMusicIcon}
          label="Music Editor"
          active={isActive('/music-editor')}
          onClick={() => navigate('/music-editor')}
        />

        <SectionHeader label="Flows" open={flowsOpen} onToggle={() => setFlowsOpen(!flowsOpen)} />
        <Collapse in={flowsOpen} timeout="auto" unmountOnExit>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {flows.map((flow) => (
              <NavItem
                key={flow.id}
                dense
                icon={FlowIcon}
                label={flow.name}
                active={location.pathname === `/flow/${flow.id}`}
                onClick={() => navigate(`/flow/${flow.id}`)}
              />
            ))}
          </Box>
        </Collapse>

        <SectionHeader label="Pipeline" open={pipelineOpen} onToggle={() => setPipelineOpen(!pipelineOpen)} />
        <Collapse in={pipelineOpen} timeout="auto" unmountOnExit>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>{commandItems(pipelineCommands)}</Box>
        </Collapse>

        <SectionHeader label="Utility" open={utilityOpen} onToggle={() => setUtilityOpen(!utilityOpen)} />
        <Collapse in={utilityOpen} timeout="auto" unmountOnExit>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>{commandItems(utilityCommands)}</Box>
        </Collapse>
      </Box>

      <Box sx={{ px: 1.25, py: 1.25, borderTop: `1px solid ${tokens.hairline}` }}>
        <NavItem
          icon={SettingsIcon}
          label="Global Config"
          active={isActive('/config')}
          onClick={() => navigate('/config')}
        />
      </Box>
    </Box>
  );
}

export default Sidebar;
