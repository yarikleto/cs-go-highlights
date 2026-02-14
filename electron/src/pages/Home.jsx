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
  Divider,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Build as BuildIcon,
  Analytics as AnalyticsIcon,
  Movie as MovieIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

function Home() {
  const navigate = useNavigate();
  const [commands, setCommands] = useState([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getCommands().then(setCommands);
    }
  }, []);

  const pipelineCommands = commands.filter(c => c.category === 'Pipeline');
  const utilityCommands = commands.filter(c => c.category === 'Utility');

  const CommandCard = ({ command }) => (
    <Card 
      sx={{ 
        height: '100%',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        },
      }}
    >
      <CardActionArea 
        onClick={() => navigate(`/command/${command.id}`)}
        sx={{ height: '100%', p: 1 }}
      >
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {command.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {command.description}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
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
    <Box sx={{ p: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          CS:GO Highlights Tool
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Automatically detect and render impressive gameplay moments from demo files.
        </Typography>
      </Box>

      {/* Quick Start Pipeline */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PlayIcon color="primary" />
          <Typography variant="h5">Pipeline</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Run these commands in order to go from demo files to final highlight video.
        </Typography>
        
        <Grid container spacing={2}>
          {pipelineCommands.map((cmd) => (
            <Grid item xs={12} sm={6} md={4} key={cmd.id}>
              <CommandCard command={cmd} />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Divider sx={{ my: 4 }} />

      {/* Utility Commands */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <BuildIcon color="secondary" />
          <Typography variant="h5">Utility</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Additional tools for specific tasks.
        </Typography>
        
        <Grid container spacing={2}>
          {utilityCommands.map((cmd) => (
            <Grid item xs={12} sm={6} md={4} key={cmd.id}>
              <CommandCard command={cmd} />
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* V2 Pipeline Guide */}
      <Box sx={{ mt: 4, p: 3, bgcolor: 'background.paper', borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Recommended V2 Pipeline
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip 
            icon={<AnalyticsIcon />} 
            label="1. Analyze V2" 
            onClick={() => navigate('/command/analyze-v2')}
            clickable
          />
          <Typography color="text.secondary">→</Typography>
          <Chip 
            icon={<SpeedIcon />} 
            label="2. Analyze Postprocess UI" 
            onClick={() => navigate('/command/analyze-postprocess-ui')}
            clickable
          />
          <Typography color="text.secondary">→</Typography>
          <Chip 
            icon={<MovieIcon />} 
            label="3. Record" 
            onClick={() => navigate('/command/record')}
            clickable
          />
          <Typography color="text.secondary">→</Typography>
          <Chip 
            label="4. Postprocess UI" 
            onClick={() => navigate('/command/postprocess-ui')}
            clickable
          />
          <Typography color="text.secondary">→</Typography>
          <Chip 
            label="5. Merge" 
            onClick={() => navigate('/command/merge')}
            clickable
          />
        </Box>
      </Box>
    </Box>
  );
}

export default Home;
