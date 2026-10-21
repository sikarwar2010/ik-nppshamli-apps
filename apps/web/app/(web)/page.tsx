import variant from "@site/variant"
import type { Metadata } from "next"

export const metadata: Metadata = { alternates: { canonical: "/" } }

export default function Home() {
  return <variant.Home />
}
