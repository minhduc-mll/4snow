import { Suspense } from "react";

import { PlayerQuizClient } from "./PlayerQuizClient";

export default function PlayerQuizPage() {
  return (
    <main className="min-h-screen bg-app-subtle px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col justify-center gap-5">
        <Suspense fallback={null}>
          <PlayerQuizClient />
        </Suspense>
      </div>
    </main>
  );
}
