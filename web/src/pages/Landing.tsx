import { Link } from '@tanstack/react-router';

export function Landing() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-neutral-950 text-neutral-50">
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gradient-to-br from-indigo-400 to-pink-400" />
          <span className="font-serif text-3xl font-semibold">Pulse</span>
        </div>
        <p className="mb-8 text-sm text-neutral-500">chat, feed, servers, stories — one app</p>
        <Link
          to="/login"
          className="inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200"
        >
          Get started
        </Link>
      </div>
    </div>
  );
}
