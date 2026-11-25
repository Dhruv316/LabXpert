import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../../components/ui';
import { t } from '../../i18n';
import { MessageScreen } from './MessageScreen';

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches any render error, including UnknownTextKeyError and MissingParamError from t().
 * It keeps no error text in state and renders none: the student only sees the friendly screen.
 * It sits outside the router, so "Back to start" sets the hash itself and then tries again.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // For the developer's console only; never rendered.
    if (import.meta.env.DEV) console.error(error, info.componentStack);
  }

  private readonly backToStart = () => {
    window.location.hash = '#/';
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <MessageScreen
        className="min-h-screen"
        title={t('error.title')}
        body={t('error.body')}
        action={<Button onClick={this.backToStart}>{t('error.backToStart')}</Button>}
      />
    );
  }
}
