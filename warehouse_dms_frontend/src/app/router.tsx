import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RequireAuth } from '@/components/layout/require-auth'
import { useAuth } from '@/hooks/use-auth'
import { OperationalShell } from '@/layouts/operational-shell'
import { DashboardPage } from '@/pages/dashboard-page'
import { DocumentReviewPage } from '@/pages/document-review-page'
import { DocumentsPage } from '@/pages/documents-page'
import { LoginPage } from '@/pages/login-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { DepositorCorrectionPage } from '@/pages/depositor/depositor-correction-page'
import { DepositorDocumentDetailPage } from '@/pages/depositor/depositor-document-detail-page'
import { StaffPermissionFormPage } from '@/pages/staff-permission-form-page'
import { ScanUploadPage } from '@/pages/scan-upload-page'
import { StaffPermissionCorrectionPage } from '@/pages/staff-permission-correction-page'
import { DepositorDocumentsPage } from '@/pages/depositor/depositor-documents-page'
import { DepositorDownloadsPage } from '@/pages/depositor/depositor-downloads-page'
import { DepositorHomePage } from '@/pages/depositor/depositor-home-page'
import { DepositorRegistrationFormPage } from '@/pages/depositor/depositor-registration-form-page'
import { DepositorUploadPage } from '@/pages/depositor/depositor-upload-page'
import { PlaceholderPage } from '@/pages/placeholder-page'
import { RegulatorShell } from '@/layouts/regulator-shell'
import { RegulatorDashboardPage } from '@/pages/regulator/regulator-dashboard-page'
import { RegulatorDocumentViewPage } from '@/pages/regulator/regulator-document-view-page'
import { RegulatorDocumentsPage } from '@/pages/regulator/regulator-documents-page'
import { RegulatorInspectionsPage } from '@/pages/regulator/regulator-inspections-page'
import { RegulatorWarehouseDetailPage } from '@/pages/regulator/regulator-warehouse-detail-page'
import { DocumentSearchPage } from '@/pages/search/document-search-page'
import { NotificationPreferencesPage } from '@/pages/settings/notification-preferences-page'
import { SettingsPage } from '@/pages/settings/settings-page'
import { UsersPage } from '@/pages/admin/users-page'
import { WarehousesPage } from '@/pages/admin/warehouses-page'
import { AuditLogPage } from '@/pages/admin/audit-log-page'
import { TenantsPage } from '@/pages/admin/tenants-page'

function HomeRedirect() {
  const { isAuthenticated, primaryRole } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (primaryRole === 'DEPOSITOR') {
    return <Navigate to="/depositor" replace />
  }

  if (primaryRole === 'REGULATOR') {
    return <Navigate to="/regulator" replace />
  }

  return <Navigate to="/dashboard" replace />
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth roles={['STAFF', 'MANAGER', 'CEO', 'ADMIN']} />}>
          <Route element={<OperationalShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/search" element={<DocumentSearchPage />} />
            <Route path="/documents/:id/correct" element={<StaffPermissionCorrectionPage />} />
            <Route path="/documents/:id" element={<DocumentReviewPage />} />
            <Route path="/forms/staff-permission" element={<StaffPermissionFormPage />} />
            <Route path="/documents/upload" element={<ScanUploadPage />} />
            <Route path="/notifications" element={<PlaceholderPage title="Notifications" />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/tenants" element={<TenantsPage />} />
            <Route path="/admin/warehouses" element={<WarehousesPage />} />
            <Route path="/admin/audit" element={<AuditLogPage />} />
            <Route path="/analytics" element={<PlaceholderPage title="Analytics" />} />
          </Route>
        </Route>

        <Route element={<RequireAuth roles={['DEPOSITOR']} />}>
          <Route element={<OperationalShell />}>
            <Route path="/depositor" element={<DepositorHomePage />} />
            <Route path="/depositor/upload" element={<DepositorUploadPage />} />
            <Route path="/depositor/documents" element={<DepositorDocumentsPage />} />
            <Route path="/depositor/documents/:id/correct" element={<DepositorCorrectionPage />} />
            <Route path="/depositor/documents/:id" element={<DepositorDocumentDetailPage />} />
            <Route path="/depositor/downloads" element={<DepositorDownloadsPage />} />
            <Route path="/depositor/forms/depositor-registration" element={<DepositorRegistrationFormPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth roles={['REGULATOR', 'ADMIN']} />}>
          <Route element={<RegulatorShell />}>
            <Route path="/regulator" element={<RegulatorDashboardPage />} />
            <Route path="/regulator/search" element={<DocumentSearchPage regulator />} />
            <Route path="/regulator/warehouses/:id" element={<RegulatorWarehouseDetailPage />} />
            <Route path="/regulator/documents" element={<RegulatorDocumentsPage />} />
            <Route path="/regulator/inspections" element={<RegulatorInspectionsPage />} />
            <Route path="/regulator/notifications" element={<PlaceholderPage title="Notifications" />} />
            <Route path="/regulator/documents/:id" element={<RegulatorDocumentViewPage />} />
            <Route path="/regulator/upload" element={<ScanUploadPage />} />
            <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
