import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert } from '@mui/material';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error" sx={{ m: 2 }}>
          Something went wrong. Please try refreshing the page.
          {this.state.error && (
            <div style={{ marginTop: '10px', fontSize: '12px' }}>
              Error: {this.state.error.message}
            </div>
          )}
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 