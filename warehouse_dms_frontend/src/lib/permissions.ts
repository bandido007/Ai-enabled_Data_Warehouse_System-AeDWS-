import {
  Bell,
  Building2,
  ClipboardList,
  Download,
  FileSearch,
  Files,
  Gauge,
  Home,
  LayoutDashboard,
  Settings,
  Shield,
  Upload,
  Users,
  Warehouse,
} from 'lucide-react'

import type { NavigationItem, UserRole } from '@/types/api'

export const iconMap = {
  Bell,
  Building2,
  ClipboardList,
  Download,
  FileSearch,
  Files,
  Gauge,
  Home,
  LayoutDashboard,
  Settings,
  Shield,
  Upload,
  Users,
  Warehouse,
}

export const navigationItems: NavigationItem[] = [
  {
    key: 'depositor-home',
    labelKey: 'navigation.depositorHome',
    to: '/depositor',
    icon: 'Home',
    roles: ['DEPOSITOR'],
  },
  {
    key: 'depositor-documents',
    labelKey: 'navigation.depositorDocuments',
    to: '/depositor/documents',
    icon: 'Files',
    roles: ['DEPOSITOR'],
  },
  {
    key: 'depositor-upload',
    labelKey: 'navigation.depositorUpload',
    to: '/depositor/upload',
    icon: 'Upload',
    roles: ['DEPOSITOR'],
  },
  {
    key: 'depositor-forms',
    labelKey: 'navigation.depositorForms',
    to: '/depositor/forms/depositor-registration',
    icon: 'ClipboardList',
    roles: ['DEPOSITOR'],
  },
  {
    key: 'depositor-downloads',
    labelKey: 'navigation.depositorDownloads',
    to: '/depositor/downloads',
    icon: 'Download',
    roles: ['DEPOSITOR'],
  },
  {
    key: 'staff-permission-form',
    labelKey: 'navigation.staffPermissionForm',
    to: '/forms/staff-permission',
    icon: 'ClipboardList',
    roles: ['STAFF', 'MANAGER'],
  },
  {
    key: 'upload-document',
    labelKey: 'navigation.uploadDocument',
    to: '/documents/upload',
    icon: 'Upload',
    roles: ['STAFF', 'MANAGER', 'CEO', 'ADMIN'],
  },
  {
    key: 'dashboard',
    labelKey: 'navigation.dashboard',
    to: '/dashboard',
    icon: 'LayoutDashboard',
    roles: ['STAFF', 'MANAGER', 'CEO', 'ADMIN'],
  },
  {
    key: 'documents',
    labelKey: 'navigation.documents',
    to: '/documents',
    icon: 'Files',
    permissions: ['view_warehouse_documents', 'view_tenant_documents'],
    roles: ['STAFF', 'MANAGER', 'CEO', 'ADMIN'],
    badge: 'queue',
  },
  {
    key: 'search',
    labelKey: 'navigation.search',
    to: '/search',
    icon: 'FileSearch',
    permissions: ['keyword_search_documents', 'semantic_search_documents'],
    roles: ['STAFF', 'MANAGER', 'CEO', 'ADMIN'],
  },
  {
    key: 'notifications',
    labelKey: 'navigation.notifications',
    to: '/notifications',
    icon: 'Bell',
    permissions: ['view_own_notifications'],
    roles: ['STAFF', 'MANAGER', 'CEO', 'ADMIN'],
    badge: 'notifications',
  },
  {
    key: 'settings',
    labelKey: 'navigation.settings',
    to: '/settings',
    icon: 'Settings',
    roles: ['STAFF', 'MANAGER', 'CEO', 'ADMIN'],
  },
  {
    key: 'users',
    labelKey: 'navigation.users',
    to: '/admin/users',
    icon: 'Users',
    permissions: ['manage_users'],
    roles: ['ADMIN'],
  },
  {
    key: 'tenants',
    labelKey: 'navigation.tenants',
    to: '/admin/tenants',
    icon: 'Building2',
    permissions: ['manage_tenants'],
    roles: ['ADMIN'],
  },
  {
    key: 'warehouses',
    labelKey: 'navigation.warehouses',
    to: '/admin/warehouses',
    icon: 'Warehouse',
    permissions: ['manage_warehouses', 'manage_tenants'],
    roles: ['ADMIN'],
  },
  {
    key: 'audit',
    labelKey: 'navigation.audit',
    to: '/admin/audit',
    icon: 'Shield',
    permissions: ['view_audit_trail'],
    roles: ['ADMIN'],
  },
  {
    key: 'analytics',
    labelKey: 'navigation.analytics',
    to: '/analytics',
    icon: 'Gauge',
    permissions: ['generate_report'],
    roles: ['CEO'],
  },
]

export function hasAnyPermission(permissionSet: Set<string>, permissions?: string[]) {
  if (!permissions?.length) {
    return true
  }

  return permissions.some((permission) => permissionSet.has(permission))
}

export function hasAnyRole(role: UserRole | null, roles?: UserRole[]) {
  if (!roles?.length) {
    return true
  }

  return role ? roles.includes(role) : false
}
