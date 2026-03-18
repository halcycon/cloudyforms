import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Layers,
  ListOrdered,
  Monitor,
  Building2,
  Shield,
  CloudLightning,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { orgs } from '@/lib/api';
import { cn, getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Organization } from '@/lib/types';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { label: 'Forms', href: '/forms', icon: <FileText className="h-4 w-4" /> },
  { label: 'Field Groups', href: '/field-groups', icon: <Layers className="h-4 w-4" /> },
  { label: 'Option Lists', href: '/option-lists', icon: <ListOrdered className="h-4 w-4" /> },
  { label: 'Kiosk', href: '/kiosk-setup', icon: <Monitor className="h-4 w-4" /> },
  { label: 'Organizations', href: '/orgs', icon: <Building2 className="h-4 w-4" /> },
  { label: 'Settings', href: '/settings', icon: <Settings className="h-4 w-4" /> },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userOrgs, setUserOrgs] = useState<Organization[]>([]);
  const { user, currentOrg, setCurrentOrg, logout } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    orgs.list().then((data) => {
      setUserOrgs(data);
      if (!currentOrg && data.length > 0) {
        const savedOrgId = localStorage.getItem('cf_current_org');
        const saved = data.find((o) => o.id === savedOrgId);
        setCurrentOrg(saved ?? data[0]);
      }
    }).catch(() => {});
  }, [currentOrg, setCurrentOrg]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function isActive(item: NavItem) {
    if (item.exact) return location.pathname === item.href;
    return location.pathname.startsWith(item.href);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-gray-900 text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4 border-b border-gray-800">
        <CloudLightning className="h-6 w-6 text-primary-400" />
        <span className="text-lg font-bold">CloudyForms</span>
      </div>

      {/* Org switcher */}
      {userOrgs.length > 0 && (
        <div className="px-3 py-3 border-b border-gray-800">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
              {currentOrg?.logoUrl ? (
                <img src={currentOrg.logoUrl} alt="" className="h-5 w-5 rounded-sm object-contain" />
              ) : (
                <div
                  className="h-5 w-5 rounded-sm flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: currentOrg?.primaryColor ?? '#4f46e5' }}
                >
                  {currentOrg?.name?.[0]?.toUpperCase() ?? 'O'}
                </div>
              )}
              <span className="flex-1 text-left truncate">{currentOrg?.name ?? 'Select org'}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>Organizations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {userOrgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => setCurrentOrg(org)}
                  className={cn(currentOrg?.id === org.id && 'bg-gray-100')}
                >
                  {org.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/orgs/new')}>
                + New Organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive(item)
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white',
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        {user?.isSuperAdmin && (
          <Link
            to="/admin"
            onClick={() => setSidebarOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              location.pathname === '/admin'
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white',
            )}
          >
            <Shield className="h-4 w-4" />
            Admin
          </Link>
        )}
      </nav>

      {/* User menu */}
      <div className="border-t border-gray-800 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
            <Avatar className="h-7 w-7">
              <AvatarImage src="" />
              <AvatarFallback className="bg-primary-600 text-white text-xs">
                {user?.name ? getInitials(user.name) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left min-w-0">
              <div className="truncate font-medium text-white">{user?.name}</div>
              <div className="truncate text-xs text-gray-400">{user?.email}</div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" side="top" align="start">
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:flex-shrink-0">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 z-50">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <CloudLightning className="h-5 w-5 text-primary-600" />
            <span className="font-bold text-gray-900">CloudyForms</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary-600 text-white text-xs">
                {user?.name ? getInitials(user.name) : 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile sidebar close button */}
      {sidebarOpen && (
        <button
          className="fixed right-4 top-4 z-50 rounded-md bg-gray-800 p-1.5 text-white lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
