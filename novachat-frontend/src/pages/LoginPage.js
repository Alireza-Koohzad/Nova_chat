import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css'; // یک فایل CSS مشترک برای صفحات احراز هویت

function LoginPage() {
    const [loginInput, setLoginInput] = useState(''); // می‌تواند username یا email باشد
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login({ login: loginInput, password });
            navigate('/'); // هدایت به صفحه اصلی چت
        } catch (err) {
            setError(err.message || 'Failed to login. Please check your credentials.');
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-form-wrapper">
                <h2>Login to NovaChat</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="login">Username or Email</label>
                        <input
                            type="text"
                            id="login"
                            value={loginInput}
                            onChange={(e) => setLoginInput(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
                <p className="auth-switch-link">
                    Don't have an account? <Link to="/register">Register here</Link>
                </p>
            </div>
        </div>
    );
}

export default LoginPage;