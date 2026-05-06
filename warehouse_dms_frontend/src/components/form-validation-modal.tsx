import { AlertCircle, CheckCircle2, AlertTriangle, Zap, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useState } from 'react'
import type { FormValidationResult } from '@/lib/queries'

interface FormValidationModalProps {
  open: boolean
  result: FormValidationResult | null
  loading?: boolean
  onClose: () => void
  onSubmitAnyway: () => void
  onRevalidate: () => void
}

export function FormValidationModal({
  open,
  result,
  loading = false,
  onClose,
  onSubmitAnyway,
  onRevalidate,
}: FormValidationModalProps) {
  const [expandedSection, setExpandedSection] = useState<'issues' | 'recommendations' | null>('issues')

  if (!result) return null

  const { confidence, verdict, issues, recommendations } = result

  // Determine styling based on verdict
  const verdictConfig = {
    PASS: {
      color: 'from-green-50 to-emerald-50',
      badgeColor: 'bg-green-100 text-green-800',
      icon: <CheckCircle2 className="w-6 h-6 text-green-600" />,
      title: '✓ Form is Valid',
      subtitle: 'All checks passed. You can submit this form.',
      borderColor: 'border-green-200',
    },
    SOFT_WARNING: {
      color: 'from-amber-50 to-yellow-50',
      badgeColor: 'bg-amber-100 text-amber-800',
      icon: <AlertTriangle className="w-6 h-6 text-amber-600" />,
      title: '⚠ Form has warnings',
      subtitle: 'Some fields may need review, but you can still submit.',
      borderColor: 'border-amber-200',
    },
    HARD_REJECT: {
      color: 'from-red-50 to-rose-50',
      badgeColor: 'bg-red-100 text-red-800',
      icon: <AlertCircle className="w-6 h-6 text-red-600" />,
      title: '✕ Form has critical issues',
      subtitle: 'Please fix the issues below before submitting.',
      borderColor: 'border-red-200',
    },
  }

  const config = verdictConfig[verdict]
  const canSubmitAnyway = verdict !== 'HARD_REJECT'

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Form Validation Results</DialogTitle>
          <DialogDescription>
            AI has analyzed your form and provided feedback before submission
          </DialogDescription>
        </DialogHeader>

        <div className={`rounded-xl p-6 bg-gradient-to-br ${config.color} border ${config.borderColor} space-y-4`}>
          {/* Verdict badge */}
          <div className="flex items-start gap-4">
            <div>{config.icon}</div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-gray-900 mb-1">{config.title}</h3>
              <p className="text-sm text-gray-700">{config.subtitle}</p>
            </div>
          </div>

          {/* Confidence score */}
          <div className="bg-white/60 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Confidence Score</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    confidence >= 0.8
                      ? 'bg-green-500'
                      : confidence >= 0.6
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold text-gray-900">{Math.round(confidence * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Issues section */}
        {issues.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() =>
                setExpandedSection(expandedSection === 'issues' ? null : 'issues')
              }
              className="w-full flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 transition-colors group"
            >
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="font-semibold text-red-900 flex-1 text-left">
                Issues Found ({issues.length})
              </span>
              <ChevronDown
                className={`w-4 h-4 text-red-600 transition-transform ${
                  expandedSection === 'issues' ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expandedSection === 'issues' && (
              <div className="px-4 py-3 bg-red-50 rounded-lg border border-red-100 space-y-2">
                {issues.map((issue, idx) => (
                  <div key={idx} className="flex gap-2 text-sm text-red-800">
                    <span className="flex-shrink-0 font-bold">•</span>
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations section */}
        {recommendations.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() =>
                setExpandedSection(expandedSection === 'recommendations' ? null : 'recommendations')
              }
              className="w-full flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors group"
            >
              <Zap className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="font-semibold text-blue-900 flex-1 text-left">
                Recommendations ({recommendations.length})
              </span>
              <ChevronDown
                className={`w-4 h-4 text-blue-600 transition-transform ${
                  expandedSection === 'recommendations' ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expandedSection === 'recommendations' && (
              <div className="px-4 py-3 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                {recommendations.map((rec, idx) => (
                  <div key={idx} className="flex gap-2 text-sm text-blue-800">
                    <span className="flex-shrink-0 font-bold">→</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 pt-4 border-t">
          <Button
            onClick={onClose}
            variant="ghost"
          >
            Close
          </Button>
          <Button
            onClick={onRevalidate}
            variant="secondary"
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Validating…</>
            ) : (
              'Revalidate'
            )}
          </Button>
          {canSubmitAnyway && (
            <Button
              onClick={onSubmitAnyway}
              disabled={loading}
              className={verdict === 'PASS' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}
            >
              {verdict === 'PASS' ? 'Submit Form Now' : 'Submit Anyway'}
            </Button>
          )}
          {verdict === 'HARD_REJECT' && (
            <div className="text-xs text-red-600 font-semibold">
              Please fix the issues before submitting
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
