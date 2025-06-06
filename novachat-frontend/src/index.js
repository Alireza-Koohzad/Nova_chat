import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // می‌توانید یک فایل CSS گلوبال هم داشته باشید
import App from './App';
import reportWebVitals from './reportWebVitals';

// برای React 18+
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

reportWebVitals();