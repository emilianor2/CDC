/// <reference types="vite/client" />

import page from './index.html?raw';
import styles from './styles.css?raw';
import app from './app.js?raw';
import cardDesign from './card-design.js?raw';
import posterDesign from './poster-design.js?raw';
import adapter from './client-adapter.js?raw';
import landing from './landing.html?raw';
import landingStyles from './landing.css?raw';

export const UI = page
  .replace('<style></style>', () => '<style>' + styles + '</style>')
  .replace('<script></script>', () => '<script>' + app + cardDesign + posterDesign + adapter + '</script>');

export const LANDING = landing.replace('<style></style>', () => '<style>' + landingStyles + '</style>');
