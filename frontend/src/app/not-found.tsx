import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold tracking-tight text-faint">404</p>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        This page doesn&apos;t exist or isn&apos;t enabled for your firm.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
