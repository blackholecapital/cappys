import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Cappy's Electrical", description: "Customers, estimates, recurring billing and an AI receptionist—kept simple.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
