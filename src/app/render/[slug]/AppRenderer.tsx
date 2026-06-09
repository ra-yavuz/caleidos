"use client";

import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

// Dynamically import the agent-built component at /apps/<slug>/index.tsx.
// The path is relative to THIS file: src/app/render/[slug]/ -> ../../../../apps.
// The template literal keeps it a runtime import; next dev resolves it lazily
// and hot-reloads the module when the agent rewrites the file.
//
// Cache the lazy component per slug at module scope. lazy() must be created
// ONCE: a fresh lazy() on every render (or remount) discards the already
// resolved module and snaps back to the Suspense fallback, so under the
// desktop's registry polling the window would flicker on "loading..." forever.
// One stable instance per slug keeps React's resolved state.
const appCache = new Map<string, LazyExoticComponent<ComponentType>>();

function loadApp(slug: string): LazyExoticComponent<ComponentType> {
  const cached = appCache.get(slug);
  if (cached) return cached;
  const lazyApp = lazy(
    () =>
      import(
        /* webpackInclude: /index\.tsx$/ */
        `../../../../apps/${slug}/index`
      ) as Promise<{ default: ComponentType }>,
  );
  appCache.set(slug, lazyApp);
  return lazyApp;
}

class RenderErrorBoundary extends Component<
  { slug: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full overflow-auto p-4 text-sm">
          <p className="font-medium text-red-600">this app failed to render</p>
          <p className="mt-1 text-neutral-500">
            check <code>apps/{this.props.slug}/index.tsx</code> and ask the
            builder to fix it.
          </p>
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-400">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppRenderer({ slug }: { slug: string }) {
  const App = loadApp(slug);
  return (
    <RenderErrorBoundary slug={slug}>
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
            loading {slug}...
          </div>
        }
      >
        <App />
      </Suspense>
    </RenderErrorBoundary>
  );
}
