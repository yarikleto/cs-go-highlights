import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import CommandPage from './pages/CommandPage';
import GlobalConfig from './pages/GlobalConfig';
import HighlightsViewer from './pages/HighlightsViewer';
import MusicEditor from './pages/MusicEditor';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/command/:commandId" element={<CommandPage />} />
        <Route path="/config" element={<GlobalConfig />} />
        <Route path="/viewer" element={<HighlightsViewer />} />
        <Route path="/music-editor" element={<MusicEditor />} />
      </Routes>
    </Layout>
  );
}

export default App;
