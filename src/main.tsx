import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { bootstrapTheme } from './themes';
import './index.css';
import './styles/app.css';

// Paint the saved theme before React mounts so there is no flash of the wrong colors.
bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
