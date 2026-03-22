"use client";

import React from "react";

interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-surface2 border border-border flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#4A5B7A" strokeWidth="1.75"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="#4A5B7A" strokeWidth="1.75" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="0.75" fill="#4A5B7A"/>
            </svg>
          </div>
          <p className="font-syne font-bold text-base text-text-primary mb-1">Something went wrong</p>
          <p className="font-outfit text-sm text-text-muted mb-4">Please pull to refresh or try again.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="font-outfit text-sm text-primary font-medium"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
