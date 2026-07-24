import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Package, Loader2, Eye, EyeOff, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserSuggestion {
  id: string;
  username: string;
  fullName: string;
}

// ---------------------------------------------------------------------------
// User search hook — debounced 250 ms, triggers after 1 char
// ---------------------------------------------------------------------------

function useUserSearch(query: string) {
  const [results, setResults] = useState<UserSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query || query.length < 1) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}`,
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { items: UserSuggestion[] };
        setResults(data.items ?? []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { results, isSearching };
}

// ---------------------------------------------------------------------------
// UsernameAutocomplete component
// ---------------------------------------------------------------------------

interface UsernameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (user: UserSuggestion) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

function UsernameAutocomplete({
  value,
  onChange,
  onSelect,
  inputRef,
}: UsernameAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { results, isSearching } = useUserSearch(value);

  // Open dropdown when there are results or when searching
  useEffect(() => {
    if (value.length >= 1) {
      setOpen(true);
      setActiveIndex(-1);
    } else {
      setOpen(false);
    }
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleSelect(user: UserSuggestion) {
    onSelect(user);
    setOpen(false);
    setActiveIndex(-1);
  }

  const showDropdown =
    open && value.length >= 1 && (isSearching || results.length > 0 || value.length >= 1);

  const showEmpty = open && !isSearching && results.length === 0 && value.length >= 1;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.length >= 1) setOpen(true);
        }}
        autoComplete="off"
        spellCheck={false}
        className="login-input"
        placeholder="أدخل اسم المستخدم"
        data-testid="input-username"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        role="combobox"
      />

      {/* Dropdown */}
      {(showDropdown || showEmpty) && (
        <ul
          ref={listRef}
          role="listbox"
          className="login-autocomplete-dropdown"
        >
          {isSearching && (
            <li className="login-autocomplete-status">
              <Loader2 size={14} className="animate-spin inline me-1" />
              جارٍ البحث...
            </li>
          )}

          {!isSearching && showEmpty && (
            <li className="login-autocomplete-status login-autocomplete-empty">
              لا يوجد مستخدمون مطابقون
            </li>
          )}

          {!isSearching &&
            results.map((user, index) => (
              <li
                key={user.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`login-autocomplete-item ${
                  index === activeIndex ? "login-autocomplete-item--active" : ""
                }`}
                onMouseDown={(e) => {
                  // Use mousedown (not click) to fire before input blur
                  e.preventDefault();
                  handleSelect(user);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="login-autocomplete-avatar">
                  <User size={14} />
                </span>
                <span className="login-autocomplete-text">
                  <span className="login-autocomplete-fullname">
                    {user.fullName}
                  </span>
                  <span className="login-autocomplete-username">
                    {user.username}
                  </span>
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleUserSelect(user: UserSuggestion) {
    setUsername(user.username);
    // Move focus to password field after selection
    setTimeout(() => {
      passwordRef.current?.focus();
    }, 0);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("الرجاء إدخال اسم المستخدم.");
      return;
    }

    if (password.length < 4) {
      setError("يجب أن تحتوي كلمة المرور على 4 أحرف على الأقل.");
      return;
    }

    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string } | undefined;
        setError(data?.error ?? "تعذّر تسجيل الدخول. حاول مرة أخرى.");
      } else {
        setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-root">
      {/* Background decoration */}
      <div className="login-bg-orb login-bg-orb--1" aria-hidden />
      <div className="login-bg-orb login-bg-orb--2" aria-hidden />

      <div className="login-card-wrapper">
        {/* Logo / brand */}
        <div className="login-brand">
          <div className="login-logo">
            <Package size={30} className="login-logo-icon" />
          </div>
          <h1 className="login-title">نظام نقاط البيع</h1>
          <p className="login-subtitle">سجّل الدخول للمتابعة</p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {/* Username */}
          <div className="login-field">
            <label htmlFor="login-username" className="login-label">
              اسم المستخدم
            </label>
            <UsernameAutocomplete
              value={username}
              onChange={setUsername}
              onSelect={handleUserSelect}
              inputRef={usernameRef}
            />
          </div>

          {/* Password */}
          <div className="login-field">
            <label htmlFor="login-password" className="login-label">
              كلمة المرور
            </label>
            <div className="login-password-wrapper">
              <input
                ref={passwordRef}
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="login-input"
                placeholder="أدخل كلمة المرور"
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="login-password-toggle"
                tabIndex={-1}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="login-password-hint">
              يجب أن تحتوي كلمة المرور على 4 أحرف على الأقل
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="login-error"
              role="alert"
              data-testid="text-login-error"
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="login-submit"
            data-testid="button-login"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                جارٍ تسجيل الدخول...
              </>
            ) : (
              "تسجيل الدخول"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
