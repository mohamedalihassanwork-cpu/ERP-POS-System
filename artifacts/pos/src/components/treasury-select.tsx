/**
 * TreasurySelect — Shared treasury account picker
 *
 * Renders a <select> whose options are grouped by owner (via <optgroup>) so
 * that an administrator seeing all accounts can immediately tell which
 * treasury belongs to whom.
 *
 * Data notes
 * ──────────
 * The server's GET /api/treasury/accounts endpoint returns the standard
 * TreasuryAccount fields (id, type, name, balance, isActive) PLUS two extra
 * fields for users with treasury.view_all / "*" permissions:
 *   • userName  – the cashier's full name (null for the MAIN_SAFE)
 *   • userId    – the cashier's user ID  (null for the MAIN_SAFE)
 *
 * These extra fields are not part of the generated TreasuryAccount interface,
 * so we declare a local extension here.
 *
 * Grouping strategy
 * ─────────────────
 *  1. "الخزينة الرئيسية" group  (MAIN_SAFE accounts, userName = null)
 *  2. One <optgroup> per owner, sorted alphabetically by userName
 *
 * Within each group accounts are ordered: CASH → CARD → INSTAPAY → WALLET.
 *
 * For cashiers (no userName returned), a flat list is rendered — identical
 * behaviour to the original implementations.
 */

import { useEffect, useMemo } from "react";
import { useListTreasuryAccounts, type TreasuryAccount } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Extended type
// ---------------------------------------------------------------------------

/** Server returns userName + userId for admin users; not in the generated type. */
export interface TreasuryAccountWithOwner extends TreasuryAccount {
  userName?: string | null;
  userId?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_ORDER: Record<string, number> = {
  MAIN_SAFE: 0,
  CASH: 1,
  CARD: 2,
  INSTAPAY: 3,
  WALLET: 4,
};

const TYPE_LABELS: Record<string, string> = {
  MAIN_SAFE: "الخزينة الرئيسية",
  CASH: "نقدي",
  CARD: "بطاقة",
  INSTAPAY: "انستاباي",
  WALLET: "محفظة",
};

function money(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return n.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compose the visible option label.
 *
 * Examples:
 *   Admin,  balance visible  →  "درج الكاشير · أحمد محمد · ١٬٥٠٠٫٠٠"
 *   Admin,  balance hidden   →  "درج الكاشير · أحمد محمد"
 *   Cashier, balance visible →  "درج الكاشير · ١٬٥٠٠٫٠٠"
 *   Cashier, balance hidden  →  "درج الكاشير"
 */
function optionLabel(
  account: TreasuryAccountWithOwner,
  hideBalance: boolean,
): string {
  const parts: string[] = [account.name];

  // Owner context — only for accounts that have a named owner (non-MAIN_SAFE)
  if (account.userName) {
    parts.push(account.userName);
  }

  if (!hideBalance) {
    parts.push(money(account.balance));
  }

  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TreasurySelectProps {
  /** Currently selected account id */
  value: string;
  /** Called whenever the user picks a different account */
  onChange: (id: string) => void;
  /** Hide the balance from option labels (e.g. purchase-returns) */
  hideBalance?: boolean;
  /**
   * The account type to prefer when auto-selecting a default.
   * Falls back to the first active account if no match is found.
   * Defaults to "MAIN_SAFE".
   */
  defaultType?: string;
  /** Override the field label text. Defaults to "الخزينة". */
  label?: string;
  /** CSS class string for the wrapping <div>. */
  className?: string;
  /** Additional CSS classes for the <label> element. */
  labelClassName?: string;
  /** Additional CSS classes for the <select> element. */
  selectClassName?: string;
  /** data-testid forwarded to the <select> element. */
  testId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_SELECT_CLASS =
  "w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 transition";

const DEFAULT_LABEL_CLASS = "block text-xs font-bold text-slate-700 mb-1.5";

export function TreasurySelect({
  value,
  onChange,
  hideBalance = false,
  defaultType = "MAIN_SAFE",
  label = "الخزينة",
  className = "mt-2",
  labelClassName,
  selectClassName,
  testId = "select-treasury",
}: TreasurySelectProps) {
  const accountsQuery = useListTreasuryAccounts();
  const allAccounts = (accountsQuery.data ?? []) as TreasuryAccountWithOwner[];
  const accounts = allAccounts.filter((a) => a.isActive);

  // ── Auto-select default ──────────────────────────────────────────────────
  useEffect(() => {
    if (!value && accounts.length > 0) {
      const preferred =
        accounts.find((a) => a.type === defaultType) ?? accounts[0];
      if (preferred) onChange(preferred.id);
    }
  }, [accounts, value, onChange, defaultType]);

  // ── Build grouped structure ──────────────────────────────────────────────
  const { mainSafe, ownerGroups, isGrouped } = useMemo(() => {
    const mainSafeAccounts = accounts
      .filter((a) => a.type === "MAIN_SAFE")
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));

    const drawerAccounts = accounts.filter((a) => a.type !== "MAIN_SAFE");

    // Determine whether to use grouping: any account has a userName
    const hasOwnerInfo = drawerAccounts.some((a) => Boolean(a.userName));

    if (!hasOwnerInfo) {
      // Cashier mode: flat list, no grouping needed
      return { mainSafe: mainSafeAccounts, ownerGroups: [], isGrouped: false };
    }

    // Admin mode: group by owner
    const ownerMap = new Map<string, TreasuryAccountWithOwner[]>();
    const unnamedKey = ""; // accounts without userName (shouldn't happen for non-MAIN_SAFE)

    for (const a of drawerAccounts) {
      const key = a.userName ?? unnamedKey;
      if (!ownerMap.has(key)) ownerMap.set(key, []);
      ownerMap.get(key)!.push(a);
    }

    // Sort each group internally by type order
    for (const group of ownerMap.values()) {
      group.sort(
        (a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99),
      );
    }

    // Sort groups alphabetically by owner name
    const sorted = [...ownerMap.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "ar"),
    );

    return { mainSafe: mainSafeAccounts, ownerGroups: sorted, isGrouped: true };
  }, [accounts]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={className}>
      <label className={labelClassName ?? DEFAULT_LABEL_CLASS}>
        {label} <span className="text-red-500">*</span>
      </label>

      <select
        className={selectClassName ?? DEFAULT_SELECT_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        <option value="">— اختر الخزينة —</option>

        {isGrouped ? (
          <>
            {/* MAIN_SAFE group */}
            {mainSafe.length > 0 && (
              <optgroup label={TYPE_LABELS.MAIN_SAFE}>
                {mainSafe.map((a) => (
                  <option key={a.id} value={a.id}>
                    {optionLabel(a, hideBalance)}
                  </option>
                ))}
              </optgroup>
            )}

            {/* Per-owner groups */}
            {ownerGroups.map(([ownerName, group]) => (
              <optgroup
                key={ownerName || "__unnamed__"}
                label={ownerName || "بدون مستخدم"}
              >
                {group.map((a) => (
                  <option key={a.id} value={a.id}>
                    {optionLabel(a, hideBalance)}
                  </option>
                ))}
              </optgroup>
            ))}
          </>
        ) : (
          /* Flat list for cashiers */
          [...mainSafe, ...accounts.filter((a) => a.type !== "MAIN_SAFE")].map(
            (a) => (
              <option key={a.id} value={a.id}>
                {optionLabel(a, hideBalance)}
              </option>
            ),
          )
        )}
      </select>
    </div>
  );
}
