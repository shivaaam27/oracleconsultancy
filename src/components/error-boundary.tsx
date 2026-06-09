"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Catches client render errors in a subtree and shows a friendly retry card
 * instead of a blank/black screen. Used to wrap heavier interactive views
 * (e.g. the organogram) so a stray runtime error degrades gracefully.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.props.label ?? "", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl glass elevated p-6 text-center max-w-sm mx-auto my-8">
          <AlertTriangle className="mx-auto text-warn" size={22} />
          <p className="mt-2 text-sm font-medium text-fg">Something went wrong loading this view.</p>
          <p className="mt-1 text-xs text-fg-subtle">It's safe to retry — your data is unaffected.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-fg px-3.5 py-1.5 text-xs font-medium hover:bg-accent-hover transition-colors"
          >
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
