import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "トレードアプリ",
  description: "個人投資家向け 株式取引管理アプリ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body className="bg-slate-950">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
