import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

import { Skeleton } from '@/components/ui/skeleton'

import { DocumentToolbar } from './document-toolbar'
import { PageThumbnails } from './page-thumbnails'

// Worker copied to public/ — served as a plain static file, no MIME or path issues
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type FitMode = 'width' | 'page' | 'manual'

interface PdfViewerProps {
  fileUrl: string
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState<FitMode>('width')

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0
      setContainerWidth(nextWidth)
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const pageWidth = useMemo(() => {
    if (!containerWidth) {
      return undefined
    }

    if (fitMode === 'page') {
      return Math.min(containerWidth - 48, 760)
    }

    return Math.max(containerWidth - 48, 280)
  }, [containerWidth, fitMode])

  const scale = fitMode === 'manual' ? zoom : 1

  return (
    <div className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-md border border-border bg-[#F2F0EA] shadow-sm">
      <DocumentToolbar
        currentPage={currentPage}
        totalPages={numPages}
        zoomLabel={`${Math.round(scale * 100)}%`}
        onZoomOut={() => {
          setFitMode('manual')
          setZoom((current) => Math.max(0.5, Number((current - 0.1).toFixed(2))))
        }}
        onZoomIn={() => {
          setFitMode('manual')
          setZoom((current) => Math.min(2.5, Number((current + 0.1).toFixed(2))))
        }}
        onFitWidth={() => setFitMode('width')}
        onFitPage={() => setFitMode('page')}
      />

      <div ref={containerRef} className="flex-1 overflow-auto p-6 scrollbar-thin">
        <Document
          file={fileUrl}
          loading={<Skeleton className="h-[620px] w-full rounded-md" />}
          onLoadSuccess={({ numPages: total }) => {
            setNumPages(total)
            setCurrentPage((current) => Math.min(current, total))
          }}
          onLoadError={() => {
            setNumPages(0)
          }}
        >
          <div className="mx-auto flex w-full justify-center">
            <Page
              pageNumber={currentPage}
              scale={scale}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </div>
        </Document>
      </div>

      <PageThumbnails
        totalPages={numPages}
        currentPage={currentPage}
        onSelect={setCurrentPage}
        renderThumbnail={(page) => (
          <Document file={fileUrl} loading={<Skeleton className="h-24 w-16" />}>
            <Page pageNumber={page} width={88} renderTextLayer={false} renderAnnotationLayer={false} />
          </Document>
        )}
      />
    </div>
  )
}
