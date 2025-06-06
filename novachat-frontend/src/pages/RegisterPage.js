import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';

function RegisterPage() {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (password.length < 6) {
            setError("Password must be at least 6 characters long.");
            setLoading(false);
            return;
        }

        try {
            await register({ username, email, password, displayName: displayName || username });
            navigate('/'); // هدایت به صفحه اصلی چت
        } catch (err) {
            // err.message ممکن است شامل آرایه‌ای از خطاها باشد اگر از express-validator استفاده کرده باشید
            // باید این را در سرویس یا اینجا مدیریت کنید
            let errorMessage = err.message || 'Failed to register.';
            if (err.errors && Array.isArray(err.errors)) { // اگر بک‌اند آرایه خطا برگرداند
                errorMessage = err.errors.map(e => e.msg).join(', ');
            }
            setError(errorMessage);
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-form-wrapper">
                <h2>Register for NovaChat</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input type="text" id="username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={loading} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password (min. 6 characters)</label>
                        <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="displayName">Display Name (Optional)</label>
                        <input type="text" id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={loading} />
                    </div>
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Registering...' : 'Register'}
                    </button>
                </form>
                <p className="auth-switch-link">
                    Already have an account? <Link to="/login">Login here</Link>
                </p>
            </div>
        </div>
    );
}

export default RegisterPage;