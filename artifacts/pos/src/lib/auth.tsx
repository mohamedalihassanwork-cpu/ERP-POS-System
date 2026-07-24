import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  refreshSession as apiRefreshSession,
  setAuthTokenGetter,
  type CurrentUser,
  type LoginInput,
} from "@workspace/api-client-react";
import { WILDCARD_PERMISSION } from "@workspace/shared";

let currentAccessToken: string | null = null;

setAuthTokenGetter(() => currentAccessToken);

function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

function decodeExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (token: string) => {
      clearTimer();
      const expiry = decodeExpiry(token);
      if (!expiry) return;
      const delay = Math.max(expiry - Date.now() - 60_000, 5_000);
      refreshTimer.current = setTimeout(() => {
        void runRefresh();
      }, delay);
    },
    [clearTimer],
  );

  const applySession = useCallback(
    (token: string, nextUser: CurrentUser) => {
      setAccessToken(token);
      setUser(nextUser);
      scheduleRefresh(token);
    },
    [scheduleRefresh],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    clearTimer();
  }, [clearTimer]);

  const runRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const result = await apiRefreshSession();
      applySession(result.accessToken, result.user);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await apiRefreshSession();
        if (active) applySession(result.accessToken, result.user);
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await apiLogin(input);
      applySession(result.accessToken, result.user);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      const perms = user.permissions;
      return (
        perms.includes(WILDCARD_PERMISSION) || perms.includes(permission)
      );
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout, hasPermission }),
    [user, isLoading, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
