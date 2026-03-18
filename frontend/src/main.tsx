import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontSize: '14px',
            maxWidth: '400px',
          },
          success: {
            iconTheme: {
              primary: '#4f46e5',
              secondary: '#fff',
            },
          },
        }}
      />
    </BrowserRouter>
  </StrictMode>,
);
