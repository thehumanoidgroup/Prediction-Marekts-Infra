import type { Metadata } from "next";
import { MarketsExplorer } from "@/components/markets/markets-explorer";

export const metadata: Metadata = { title: "Markets" };

export default function MarketsPage() {
  return <MarketsExplorer />;
}
