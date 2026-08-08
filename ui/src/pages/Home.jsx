import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Chip,
  Paper,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  PlayArrow as PlayIcon,
  Build as BuildIcon,
  Analytics as AnalyticsIcon,
  Movie as MovieIcon,
  Speed as SpeedIcon,
  RocketLaunch as FlowIcon,
} from '@mui/icons-material';
import PageHeader from '../components/shell/PageHeader';
import { tokens, transition } from '../theme/tokens';

const tileSx = {
  height: '100%',
  transition: transition(['transform', 'border-color', 'background-color']),
  '&:hover': {
    transform: 'translateY(-2px)',
    borderColor: tokens.hairlineStrong,
    background: tokens.surface.glassHi,
  },
};

function Section({ icon: Icon, title, description, children }) {
  return (
    <Box sx={{ mb: 5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
        <Icon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="h5">{title}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      {children}
    </Box>
  );
}

function Home() {
  const navigate = useNavigate();
  const [commands, setCommands] = useState([]);
  const [flows, setFlows] = useState([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getCommands().then(setCommands);
      window.electronAPI.getFlows().then(setFlows);
    }
  }, []);

  const pipelineCommands = commands.filter(c => c.category === 'Pipeline');
  const utilityCommands = commands.filter(c => c.category === 'Utility');

  const CommandCard = ({ command }) => (
    <Card sx={tileSx}>
      <CardActionArea
        onClick={() => navigate(`/command/${command.id}`)}
        sx={{ height: '100%', borderRadius: `${tokens.radius.lg}px` }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h6" gutterBottom>
            {command.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {command.description}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {command.options?.filter(o => o.required).map((opt) => (
              <Chip
                key={opt.name}
                label={opt.label || opt.name}
                size="small"
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );

  return (
    <Box sx={{ p: 4, maxWidth: 1800 }}>
      <PageHeader
        title="CS:GO Highlights Tool"
        subtitle="Automatically detect and render impressive gameplay moments from demo files."
      />

      {flows.length > 0 && (
        <Section
          icon={FlowIcon}
          title="Flows"
          description="Pre-configured pipelines that run multiple commands in sequence."
        >
          <Grid container spacing={2}>
            {flows.map((flow) => (
              <Grid item xs={12} sm={6} md={4} xl={3} key={flow.id}>
                <Card sx={{ ...tileSx, borderColor: alpha(tokens.accent, 0.3) }}>
                  <CardActionArea
                    onClick={() => navigate(`/flow/${flow.id}`)}
                    sx={{ height: '100%', borderRadius: `${tokens.radius.lg}px` }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <FlowIcon sx={{ fontSize: 17, color: 'primary.main' }} />
                        <Typography variant="h6">{flow.name}</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {flow.description}
                      </Typography>
                      <Chip
                        label={`${flow.steps?.length || 0} steps`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Section>
      )}

      <Section
        icon={PlayIcon}
        title="Pipeline"
        description="Run these commands in order to go from demo files to final highlight video."
      >
        <Grid container spacing={2}>
          {pipelineCommands.map((cmd) => (
            <Grid item xs={12} sm={6} md={4} xl={3} key={cmd.id}>
              <CommandCard command={cmd} />
            </Grid>
          ))}
        </Grid>
      </Section>

      <Section
        icon={BuildIcon}
        title="Utility"
        description="Additional tools for specific tasks."
      >
        <Grid container spacing={2}>
          {utilityCommands.map((cmd) => (
            <Grid item xs={12} sm={6} md={4} xl={3} key={cmd.id}>
              <CommandCard command={cmd} />
            </Grid>
          ))}
        </Grid>
      </Section>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recommended V2 Pipeline
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
          <Chip
            icon={<AnalyticsIcon />}
            label="1. Analyze V2"
            onClick={() => navigate('/command/analyze-v2')}
            clickable
          />
          <Typography color="text.disabled">→</Typography>
          <Chip
            icon={<SpeedIcon />}
            label="2. Analyze Postprocess UI"
            onClick={() => navigate('/command/analyze-postprocess-ui')}
            clickable
          />
          <Typography color="text.disabled">→</Typography>
          <Chip
            icon={<MovieIcon />}
            label="3. Record"
            onClick={() => navigate('/command/record')}
            clickable
          />
          <Typography color="text.disabled">→</Typography>
          <Chip
            label="4. Postprocess UI"
            onClick={() => navigate('/command/postprocess-ui')}
            clickable
          />
          <Typography color="text.disabled">→</Typography>
          <Chip
            label="5. Merge"
            onClick={() => navigate('/command/merge')}
            clickable
          />
        </Box>
      </Paper>
    </Box>
  );
}

export default Home;
