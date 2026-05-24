import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Week",
  description: "A weekly planner with 18 themes and a real database.",
};

// Tiny inline script to read the saved theme from localStorage and apply it
// before the page paints — avoids a flash of the default theme.
const setThemeScript = `
  try {
    var t = localStorage.getItem('weeklyPlannerTheme_v2') || 'bubbly';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="bubbly" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Fredoka:wght@500;600;700&family=Caveat:wght@400;600;700&family=Patrick+Hand&family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&family=Lora:wght@400;500;600&family=Comfortaa:wght@400;500;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Crimson+Pro:ital,wght@0,400;0,500;0,600;1,400&family=VT323&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: setThemeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
