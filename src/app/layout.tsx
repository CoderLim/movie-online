import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '电影上线追踪',
  description: '追踪院线电影在各大平台的上线动态',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#f5f5f5' }}>
        <nav style={{ background: '#1a1a2e', color: 'white', padding: '12px 24px', display: 'flex', gap: 16 }}>
          <a href="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>🎬 电影上线追踪</a>
          <a href="/watchlist" style={{ color: '#ccc', textDecoration: 'none' }}>我的追踪</a>
        </nav>
        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
