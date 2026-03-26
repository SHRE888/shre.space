import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Surface the real error in the console for debugging
    console.error('React ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: '#ffffff',
            color: '#111827',
            fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ maxWidth: 640, textAlign: 'left' }}>
            <h1 style={{ fontSize: 19, letterSpacing: '0.5em', textTransform: 'uppercase', color: '#9CA3AF' }}>
              Application Crash
            </h1>
            <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6 }}>
              The interface failed to render due to a runtime error.
            </p>
            <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: '#4B5563' }}>
              <strong>Error message:</strong>{' '}
              <code style={{ background: '#F3F4F6', padding: '2px 4px', borderRadius: 4 }}>
                {this.state.error?.message ?? 'Unknown error'}
              </code>
            </p>
            <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: '#6B7280' }}>
              Open the browser DevTools console to see the full stack trace and component stack. Share the
              <strong> first red error line</strong> from the console in Cursor for precise debugging.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

