import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { setToken } from './api';

// optional deep-link login: /?token=... — DEV only, ignored in production builds
const tp = import.meta.env.DEV ? new URLSearchParams(location.search).get('token') : null;
if (tp) setToken(tp);

createRoot(document.getElementById('root')!).render(<App />);
