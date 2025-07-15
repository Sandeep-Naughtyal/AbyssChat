import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-black text-red-500 font-mono h-screen flex items-center justify-center">
          <div className="text-center border border-red-500 p-8">
            <h1 className="text-xl mb-4">SYSTEM ERROR</h1>
            <p className="mb-4">Something went wrong. Please refresh the page.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="border border-red-500 px-4 py-2 hover:bg-red-500 hover:text-black"
            >
              RELOAD
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

