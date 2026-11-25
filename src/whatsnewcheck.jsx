// TEMP: renders the app shell without sign-in, to look at the What's new page on a preview. To be removed.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
if (!location.hash) location.hash = '#/whats-new';
if (new URLSearchParams(location.search).has('fresh')) { try { localStorage.removeItem('m2:whatsnew-seen'); } catch {} }
if (new URLSearchParams(location.search).has('seen')) { try { localStorage.setItem('m2:whatsnew-seen', new URLSearchParams(location.search).get('seen')); } catch {} }
createRoot(document.getElementById('root')).render(<App />);
