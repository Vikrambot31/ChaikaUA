import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Render crash:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '48px 32px',
          textAlign: 'center',
          background: '#0d1117',
        }}>
          <p style={{ fontSize: 40, marginBottom: 16 }}>{'⚠️'}</p>
          <h2 style={{ color: '#e05050', marginBottom: 12 }}>Произошла ошибка отображения</h2>
          <p style={{ color: '#c8d6e8', maxWidth: 480, lineHeight: 1.6, marginBottom: 8 }}>
            {this.state.error.message}
          </p>
          <p style={{ color: '#5d6f8b', fontSize: 13, marginBottom: 24 }}>
            Откройте консоль браузера для деталей.
          </p>
          <button
            type="button"
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#253040',
              color: '#e8f0fe',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => window.location.reload()}
          >
            Перезагрузить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
