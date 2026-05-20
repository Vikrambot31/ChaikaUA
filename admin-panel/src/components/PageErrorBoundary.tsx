import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  pageName?: string;
};

type State = { error: Error | null };

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PageErrorBoundary]', this.props.pageName ?? 'page', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 36, marginBottom: 16 }}>{'⚠️'}</p>
          <h3 style={{ color: '#e05050', marginBottom: 12, fontSize: 18 }}>
            Ошибка на странице{this.props.pageName ? ` «${this.props.pageName}»` : ''}
          </h3>
          <p style={{ color: '#c8d6e8', maxWidth: 440, margin: '0 auto 8px', lineHeight: 1.6, fontSize: 14 }}>
            {this.state.error.message}
          </p>
          <p style={{ color: '#5d6f8b', fontSize: 12, marginBottom: 24 }}>
            Подробности — в консоли браузера (F12).
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: '#253040', color: '#e8f0fe',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
              onClick={this.reset}
            >
              Попробовать снова
            </button>
            <button
              type="button"
              style={{
                padding: '8px 20px', borderRadius: 8,
                border: '1px solid #3a4b59', background: 'none', color: '#c8d6e8',
                fontSize: 13, cursor: 'pointer',
              }}
              onClick={() => window.location.hash = 'dashboard'}
            >
              На главную
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
