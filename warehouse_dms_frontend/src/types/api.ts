export type UserRole = 'DEPOSITOR' | 'STAFF' | 'MANAGER' | 'CEO' | 'REGULATOR' | 'ADMIN'

export interface ApiEnvelope {
  response: {
    id: number
    status: boolean
    message: string
    code: number
  }
}

export interface PaginatedMeta {
  number?: number | null
  hasNextPage?: boolean | null
  hasPreviousPage?: boolean | null
  currentPageNumber?: number | null
  nextPageNumber?: number | null
  previousPageNumber?: number | null
  numberOfPages?: number | null
  totalElements?: number | null
  pagesNumberArray?: number[] | null
}

export interface PaginatedResponse<T> extends ApiEnvelope {
  page?: PaginatedMeta | null
  data?: T[] | null
}

export interface ItemResponse<T> extends ApiEnvelope {
  data?: T | null
}

export interface UserInfo {
  id: string
  userName: string
  email: string
  firstName: string
  lastName: string
}

export interface RolePermissions {
  roleName: UserRole
  permissions: string[]
}

export interface LoginResponse {
  detail?: string
  access: string
  refresh: string
  expires: number
  user: UserInfo | null
  roles: RolePermissions[]
}

export interface UserSummary {
  username?: string | null
  firstName?: string | null
  lastName?: string | null
}

export interface UserProfile {
  id: number
  uniqueId: string
  username: string
  email: string
  firstName: string
  lastName: string
  accountType: UserRole
  phoneNumber: string
  hasBeenVerified: boolean
  preferredLanguage: 'en' | 'sw'
  tenantId?: number | null
  tenantUniqueId?: string | null
  tenantName?: string | null
  warehouseId?: number | null
  warehouseUniqueId?: string | null
  warehouseName?: string | null
}

export interface Warehouse {
  id: number
  uniqueId: string
  name: string
  tenantId?: number | null
  tenantName?: string | null
  regionId?: number | null
  regionName?: string | null
  address: string
  phoneNumber: string
  email: string
  capacity: number
  capacityUnit: string
  registrationNumber: string
  isVerified: boolean
}

export interface Region {
  id: number
  uniqueId: string
  name: string
  code: string
  description: string
}

export interface Tenant {
  id: number
  uniqueId: string
  name: string
  registrationNumber: string
  phoneNumber: string
  email: string
  address: string
  regionId?: number | null
  regionName?: string | null
  logoUrl: string
}

export interface WarehouseStatistics {
  warehouseId: number
  warehouseName: string
  region?: string | null
  documentsByStatus: Record<string, number>
  totalDocuments: number
  approvedDocuments: number
  rejectedDocuments: number
  documentsByType: Record<string, number>
  inspectionFormsCount: number
  correctionsRequestedCount: number
  lastActivityAt?: string | null
  currentRankingScore?: number | null
  riskCategory?: string | null
  complianceTrend?: 'IMPROVING' | 'STABLE' | 'DECLINING' | string | null
}

export interface DocumentTypeTransition {
  fromState: string
  toState: string
  requiredRole: UserRole
  action: string
  reasonRequired?: boolean
}

export interface AvailableTransition {
  fromState: string
  toState: string
  action: string
  requiredRole: string
  reasonRequired: boolean
}

export interface UploadAttemptStart {
  attemptId: number
  streamUrl: string
}

export interface UploadProgressEvent {
  stage?: string
  status?: string
  message?: string
  details?: Record<string, unknown>
}

export interface UploadCompleteEvent {
  stage?: string
  status?: string
  outcome?: 'PASSED' | 'SOFT_WARNING' | 'HARD_REJECT' | string
  warnings?: string[]
}

export interface DocumentTypeMetadata {
  id: string
  label: string
  formNumber?: string
  category: string
  initialState: string
  allowedUploaderRoles: UserRole[]
  viewerRoles: UserRole[]
  allowedTransitions: DocumentTypeTransition[]
  requiredFields: string[]
  optionalFields: string[]
  fileFormats: string[]
  validationRules: {
    minOcrConfidence?: number | null
    requireSignature?: boolean | null
    requireStamp?: boolean | null
    requireDate?: boolean | null
  }
  classificationHints: string[]
}

export interface WorkflowTransition {
  id: number
  uniqueId: string
  fromStatus: string
  toStatus: string
  action: string
  reason: string
  actor?: UserSummary | null
  editedFields: Record<string, unknown>
  aiCorrections: Record<string, unknown>
  createdDate: string
}

export interface DocumentRecord {
  id: number
  uniqueId: string
  createdDate: string
  updatedDate: string
  warehouseId: number
  warehouseName: string
  uploaderId: number
  uploaderUsername: string
  documentTypeId: string
  title: string
  fileUrl?: string | null
  status: string
  extractedText: string
  aiClassification: string
  aiExtractedFields: Record<string, unknown>
  aiSummary: string
  aiConfidenceScore?: number | null
  aiReviewNotes: string
  aiKeywords: string[]
  softWarningOverride: boolean
  currentCorrectionNote: string
  transitions: WorkflowTransition[]
  availableTransitions?: AvailableTransition[]
}

export interface NotificationEvent {
  id: number
  uniqueId: string
  createdDate: string
  eventType: string
  subject: string
  body: string
  relatedDocumentId?: number | null
  channelsSent: string[]
  readOnDashboard: boolean
  readAt?: string | null
}

export interface PreferenceItem {
  eventType: string
  channel: string
  enabled: boolean
}

export type SearchMode = 'auto' | 'keyword' | 'semantic'

export interface SearchHit {
  id: number
  title: string
  documentTypeId: string
  status: string
  warehouseName: string
  snippet: string
  score?: number | null
}

export interface SearchResponseData {
  mode: 'keyword' | 'semantic' | string
  detected: boolean
  results: SearchHit[]
}

export interface NavigationItem {
  key: string
  labelKey: string
  to: string
  icon: string
  permissions?: string[]
  roles?: UserRole[]
  badge?: 'notifications' | 'queue'
}

export interface MetricItem {
  key: string
  label: string
  value: string
  delta: string
  trend?: 'up' | 'down' | 'neutral'
  href?: string
}

export interface ActivityItem {
  id: string
  title: string
  subtitle: string
  dateLabel: string
}

export interface RecentActivityApiItem {
  documentId: number
  documentTitle: string
  action: string
  fromStatus: string
  toStatus: string
  actorName: string
  createdDate: string
}

export interface ScoreComponents {
  totalDocuments: number
  approvedRatio: number
  correctionRatio: number
  inspectionCoverage: number
  recentActivity: number
}

export interface ContributingFactor {
  type: 'positive' | 'negative' | 'neutral'
  label: string
}

export interface WarehouseRanking {
  id: number
  warehouseId: number
  warehouseName: string
  region?: string | null
  computationDate: string
  scoreComponents: ScoreComponents
  finalScore: number
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH'
  aiExplanation: string
  contributingFactors: ContributingFactor[]
  isLatest: boolean
}

export interface AnalyticsAggregates {
  totalDocuments: number
  approvedDocuments: number
  pendingDocuments: number
  rejectedDocuments: number
  correctionNeededDocuments: number
  totalUploadAttempts: number
  passedUploads: number
  rejectedUploads: number
  warehousesCount: number
}

export interface DocumentStats {
  statusCounts: Record<string, number>
  approvedThisWeek: number
  rejectedThisWeek: number
  avgApprovalHours: number | null
  recentActivity: RecentActivityApiItem[]
}

// ── Leave ──────────────────────────────────────────────────────────────────

export interface LeaveBalance {
  employeeId: number
  employeeUsername: string
  employeeFullName: string
  year: number
  annualDays: number
  daysUsed: number
  daysRemaining: number
}

export interface LeaveApplication {
  id: number
  uniqueId: string
  createdDate: string
  updatedDate: string
  isActive: boolean
  applicantId: number
  applicantUsername: string
  applicantFullName: string
  leaveType: string
  leaveTypeDisplay: string
  startDate: string
  endDate: string
  daysRequested: number
  reason: string
  status: string
  statusDisplay: string
  isEmergency: boolean
  annualDays: number
  daysUsedBefore: number
  daysRemainingBefore: number
  managerReviewedByUsername?: string | null
  managerReviewDate?: string | null
  managerComment: string
  ceoReviewedByUsername?: string | null
  ceoReviewDate?: string | null
  ceoComment: string
}
