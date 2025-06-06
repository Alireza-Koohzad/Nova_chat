import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatPage from './pages/ChatPage';
import { AuthProvider, useAuth } from './contexts/AuthContext'; // فرض بر اینکه AuthContext را داریم

// کامپوننت برای روت‌های خصوصی
function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function App() {
  return (
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
                path="/"
                element={
                  <PrivateRoute>
                    <ChatPage />
                  </PrivateRoute>
                }
            />
            {/* می‌توانید یک روت برای 404 هم اضافه کنید */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </AuthProvider>
  );
}

export default App;