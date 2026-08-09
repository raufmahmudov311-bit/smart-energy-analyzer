import "./globals.css";

export const metadata = {
  title: "Smart Grid AI — Enerji Analitikası və İdarəetmə Paneli",
  description:
    "Süni İntellektlə Dəstəklənən Enerji Təhlili və Qənaət Platforması",
};

export default function RootLayout({ children }) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
