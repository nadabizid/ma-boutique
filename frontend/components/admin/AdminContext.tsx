'use client';

import { createContext, useContext } from 'react';

export type AdminUser = { id: number; email: string; name: string; role: 'owner' | 'manager'; totp_enabled: boolean; must_change_password: boolean };

type Ctx = { admin: AdminUser | null; refresh: () => Promise<void>; isOwner: boolean };

export const AdminContext = createContext<Ctx>({ admin: null, refresh: async () => {}, isOwner: false });
export const useAdmin = () => useContext(AdminContext);
