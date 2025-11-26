import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './app/globals.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Page Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '2rem',
          background: '#f8f9fa'
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '1rem',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            maxWidth: '600px',
            textAlign: 'center'
          }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#e74c3c' }}>⚠️ Page Error</h1>
            <p style={{ fontSize: '1rem', color: '#666', marginBottom: '1rem' }}>
              This page has an error. Please check the component:
            </p>
            <pre style={{ 
              background: '#f8f9fa', 
              padding: '1rem', 
              borderRadius: '0.5rem',
              textAlign: 'left',
              overflow: 'auto',
              fontSize: '0.875rem',
              color: '#e74c3c'
            }}>
              {this.state.error?.toString()}
            </pre>
            <a href="/" style={{ 
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              background: '#00CFFF',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: '600'
            }}>
              ← Go Home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function SafeRoute({ component: Component, ...rest }) {
  return (
    <ErrorBoundary>
      <Component {...rest} />
    </ErrorBoundary>
  );
}

function EmptyPage({ pagePath }) {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '2rem',
      background: '#f8f9fa'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        maxWidth: '600px',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#3498db' }}>📄 Empty Page</h1>
        <p style={{ fontSize: '1rem', color: '#666', marginBottom: '1rem' }}>
          This page exists but has no content yet.
        </p>
        <code style={{ 
          background: '#f8f9fa', 
          padding: '0.5rem 1rem', 
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          color: '#3498db',
          display: 'block',
          marginBottom: '1rem'
        }}>
          {pagePath}
        </code>
        <p style={{ fontSize: '0.875rem', color: '#999', marginBottom: '1.5rem' }}>
          Add a default export to this file and it will hot reload automatically!
        </p>
        <a href="/" style={{ 
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: '#00CFFF',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '0.5rem',
          fontWeight: '600'
        }}>
          ← Go Home
        </a>
      </div>
    </div>
  );
}const Page0 = React.lazy(() => import('./app/page'));
const Page1 = React.lazy(() => import('./app/layout'));
const Page2 = React.lazy(() => import('./app/api/hello'));

export default function App() {
  return (
    <Router>
      <Suspense fallback={
        <div style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f8f9fa',
          color: '#666'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              border: '3px solid #f3f3f3',
              borderTop: '3px solid #00CFFF',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }}></div>
            <p>Loading page...</p>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      }>
        <Routes>
        <Route path="/" element={<SafeRoute component={Page0} />} />
        <Route path="/layout" element={<SafeRoute component={Page1} />} /> {/* File-based: /layout */}
        <Route path="/api/hello" element={<SafeRoute component={Page2} />} /> {/* File-based: /api/hello */}
        <Route path="*" element={<DefaultNotFound />} />
      </Routes>
      </Suspense>
    </Router>
  );
}
function DefaultNotFound() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: 'linear-gradient(135deg, #00CFFF 0%, #0077FF 100%)',
      color: 'white'
    }}>
      <h1 style={{ fontSize: '4rem', marginBottom: '1rem', fontWeight: 'bold' }}>404</h1>
      <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Page not found</p>
      <p style={{ fontSize: '1rem', opacity: 0.8, marginBottom: '2rem' }}>
        The page you're looking for doesn't exist
      </p>
      <a href="/" style={{ 
        padding: '1rem 2rem',
        background: 'white',
        color: '#00CFFF',
        textDecoration: 'none',
        borderRadius: '0.5rem',
        fontWeight: '600',
        fontSize: '1.1rem',
        transition: 'transform 0.2s, box-shadow 0.2s',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}
      onMouseOver={(e) => {
        e.target.style.transform = 'translateY(-2px)';
        e.target.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
      }}
      onMouseOut={(e) => {
        e.target.style.transform = 'translateY(0)';
        e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
      }}>
        ← Back to Home
      </a>
    </div>
  );
}