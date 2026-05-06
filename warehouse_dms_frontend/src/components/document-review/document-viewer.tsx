import { AlertCircle, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/empty-state'
import { isImageDocument, isPdfDocument } from '@/lib/document-review'
import { resolveFileUrl } from '@/lib/api'

import { ImageViewer } from './image-viewer'
import { PdfViewer } from './pdf-viewer'
import { FormDataViewer } from './form-data-viewer'

interface DocumentViewerProps {
  fileUrl?: string | null
  formFields?: Record<string, string> | null
}

export function DocumentViewer({ fileUrl, formFields }: DocumentViewerProps) {
  const { t } = useTranslation()
  const resolved = resolveFileUrl(fileUrl)

  if (!resolved) {
    // Form-fill documents have no file — show structured form data if available
    if (formFields && Object.keys(formFields).length > 0) {
      return <FormDataViewer fields={formFields} />
    }
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6" />}
        title={t('documentReview.viewer.fileUnavailable')}
        description={t('documentReview.viewer.fileUnavailable')}
      />
    )
  }

  if (isPdfDocument(resolved)) {
    return <PdfViewer fileUrl={resolved} />
  }

  if (isImageDocument(resolved)) {
    return <ImageViewer fileUrl={resolved} />
  }

  return (
    <EmptyState
      icon={<AlertCircle className="h-6 w-6" />}
      title={t('documentReview.viewer.fileUnavailable')}
      description={t('documentReview.viewer.fileUnavailable')}
      action={
        <Button asChild variant="secondary">
          <a href={resolved} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            {t('documentReview.viewer.download')}
          </a>
        </Button>
      }
    />
  )
}
