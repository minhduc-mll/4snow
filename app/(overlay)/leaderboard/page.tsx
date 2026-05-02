import { Suspense } from "react";

import { LeaderboardOverlayClient } from "./LeaderboardOverlayClient";

export default function LeaderboardOverlayPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardOverlayClient />
    </Suspense>
  );
}
