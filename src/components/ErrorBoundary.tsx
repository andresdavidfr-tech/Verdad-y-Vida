import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-lg w-full border border-red-100">
            <h2 className="text-xl font-bold text-red-600 mb-4">¡Ups! Algo salió mal.</h2>
            <p className="text-gray-600 mb-4">
              La aplicación encontró un error inesperado. Esto suele ocurrir si faltan variables de entorno (como GEMINI_API_KEY) en la configuración de Vercel.
            </p>
            <div className="bg-gray-100 p-4 rounded overflow-auto text-sm font-mono text-gray-800 mb-4">
              {this.state.error?.message || 'Error desconocido'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
