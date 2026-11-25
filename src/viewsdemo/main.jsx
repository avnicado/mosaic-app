import React from 'react';
import { createRoot } from 'react-dom/client';
import ViewsPage from './ViewsPage.jsx';
import { applyDocument } from '../i18n/index.js';
import './viewsdemo.css';
import './page.css';
import '../i18n/rtl.css';

applyDocument(); // <html lang dir> for the chosen interface language
createRoot(document.getElementById('root')).render(<ViewsPage />);
