import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"PANEL PUSH ARENA",description:"光るパネルを正確に押して競う、リアルタイム対戦ゲーム",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
