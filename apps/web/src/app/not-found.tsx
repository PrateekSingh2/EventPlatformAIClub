import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 text-center">
      <h1 className="text-6xl font-black text-cyan-400 font-mono mb-4">404</h1>
      <h2 className="text-xl font-bold mb-2">Page Not Found</h2>
      <p className="text-sm text-slate-400 max-w-md mb-6">
        The sandbox node or route you are attempting to access does not exist or has been relocated.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-xl bg-cyan-400 text-slate-950 font-semibold text-xs hover:bg-cyan-300 transition-colors"
      >
        Return to Safety
      </Link>
    </div>
  );
}
