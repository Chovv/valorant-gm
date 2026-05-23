// src/ui/components/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackView?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ margin: '40px auto', maxWidth: 500 }}>
          <div className="panel-body" style={{ padding: 24 }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
              Something went wrong rendering this view.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
            >
              Go back
            </button>
            <pre style={{ fontSize: 11, color: 'var(--text-dark)', marginTop: 12, whiteSpace: 'pre-wrap' }}>
              {this.state.error?.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
