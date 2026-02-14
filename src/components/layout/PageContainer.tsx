import { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  title?: string
}

export function PageContainer({ children, title }: PageContainerProps) {
  return (
    <main className="px-4 py-4 pb-20 min-h-[calc(100vh-3.5rem)]">
      {title && (
        <h2 className="text-xl font-bold text-slate-800 mb-4">{title}</h2>
      )}
      {children}
    </main>
  )
}
