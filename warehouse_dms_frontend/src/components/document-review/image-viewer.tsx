import { useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { useTranslation } from 'react-i18next'

import { DocumentToolbar } from './document-toolbar'

interface ImageViewerProps {
  fileUrl: string
}

export function ImageViewer({ fileUrl }: ImageViewerProps) {
  const { t } = useTranslation()
  const [scale, setScale] = useState(1)

  return (
    <TransformWrapper
      minScale={0.5}
      maxScale={3}
      initialScale={1}
      centerOnInit
      onZoomStop={(ref) => setScale(ref.state.scale)}
    >
      {({ zoomIn, zoomOut, resetTransform, setTransform }) => (
        <div className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-md border border-border bg-[#F2F0EA] shadow-sm">
          <DocumentToolbar
            currentPage={1}
            totalPages={1}
            zoomLabel={`${Math.round(scale * 100)}%`}
            onZoomOut={() => void zoomOut(0.15)}
            onZoomIn={() => void zoomIn(0.15)}
            onFitWidth={() => {
              resetTransform()
              setScale(1)
            }}
            onFitPage={() => {
              void setTransform(0, 0, 0.85)
              setScale(0.85)
            }}
          />
          <div className="flex flex-1 items-center justify-center overflow-auto p-6 scrollbar-thin">
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              <img
                src={fileUrl}
                alt={t('documentReview.viewer.alt')}
                className="max-h-full max-w-full rounded-md object-contain shadow-md"
              />
            </TransformComponent>
          </div>
        </div>
      )}
    </TransformWrapper>
  )
}
