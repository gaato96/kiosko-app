import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Public_Sans } from "next/font/google";
import { LimpiezaServiceWorker } from "@/components/limpieza-sw";
import "./globals.css";

/**
 * Tres familias, un trabajo cada una. Nada de una sola fuente haciendo todo.
 *
 *   Bricolage Grotesque  titulares y NUMEROS. Tiene la energia de un cartel
 *                        pintado a mano: caja alta ancha, cifras que se leen a
 *                        un metro de distancia parado frente a la caja.
 *   Public Sans          texto corrido. Callada, neutra, sin personalidad
 *                        propia — que es exactamente lo que se le pide.
 *   JetBrains Mono       el recibo. Columnas que alinean solas sin pelear.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--fuente-display",
  display: "swap",
});

const texto = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fuente-texto",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--fuente-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Kiosko App", template: "%s · Kiosko App" },
  description: "Gestión integral para kioscos y maxikioscos. Funciona sin conexión.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kiosko" },
  icons: {
    icon: [{ url: "/icons/icono-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9edf3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1219" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${display.variable} ${texto.variable} ${mono.variable}`}>
      <body>
        <LimpiezaServiceWorker />
        {children}
      </body>
    </html>
  );
}
