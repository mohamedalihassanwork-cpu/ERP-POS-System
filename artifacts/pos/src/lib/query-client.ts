/**
 * Central QueryClient configuration.
 *
 * Generic Lookup Sync Strategy
 * ─────────────────────────────
 * Any entity that can appear in a dropdown is called a "lookup".  Lookups are
 * shared across many pages (e.g. categories appear in Products AND in Reports
 * filters; suppliers appear in Purchases AND Purchase-Returns; warehouses
 * appear in POS, Purchases, Transfers …).
 *
 * Whenever ANY mutation succeeds we use MutationCache.onSuccess to
 * invalidate *every* lookup that was potentially affected, using
 * `refetchType: 'all'` so that queries which are currently mounted on
 * screen also re-fetch immediately — not just on next mount.
 *
 * This means:
 *   • Creating a supplier on the Suppliers page → the Purchases supplier
 *     dropdown updates right away.
 *   • Creating a category on the Master-Data page → the Products page
 *     category dropdown updates right away.
 *   • Creating a warehouse → stock, transfers, POS dropdowns all update.
 *   • Creating an employee → salary / advance dropdowns update.
 *   • … and so on for every lookup entity in the ERP.
 *
 * No per-page wiring is needed.  Adding a new lookup entity in the future
 * only requires adding its list endpoint path to LOOKUP_QUERY_PREFIXES.
 */

import { MutationCache, QueryClient } from "@tanstack/react-query";

/**
 * Path prefixes of all "lookup" list endpoints.
 * Any cached query whose key starts with one of these strings will be
 * invalidated (and immediately refetched if currently mounted) after every
 * successful mutation.
 *
 * Using prefixes (not exact keys) means paginated and filtered variants of
 * the same list are all covered without extra configuration.
 */
export const LOOKUP_QUERY_PREFIXES: readonly string[] = [
  // Catalog master data
  "/api/categories",
  "/api/brands",
  "/api/colors",
  "/api/sizes",

  // Parties
  "/api/suppliers",
  "/api/customers",

  // Inventory
  "/api/warehouses",
  "/api/inventory/stock",

  // Finance
  "/api/finance/employees",
  "/api/finance/expense-categories",

  // Treasury
  "/api/treasury/accounts",

  // Products (appears in search dropdowns / variant pickers)
  "/api/products",
];

/**
 * Mutations that should NOT trigger lookup invalidation.
 * These are write operations that carry no lookup impact (auth, sessions,
 * notifications, audit, etc.).
 *
 * If a mutation key is listed here the global handler skips it entirely.
 * The keys below match the `mutationKey` values set by the generated Orval
 * hooks (e.g. `['logout']`, `['login']`, …).
 */
const SKIP_MUTATION_KEYS = new Set([
  "login",
  "logout",
  "refreshSession",
  "setup",
  "changePassword",
  "resetPassword",
  "markNotificationRead",
  "markAllNotificationsRead",
  "refreshNotifications",
  "openTreasurySession",
  "closeTreasurySession",
]);

function shouldSkip(mutationKey: readonly unknown[] | undefined): boolean {
  if (!mutationKey || mutationKey.length === 0) return false;
  const first = mutationKey[0];
  return typeof first === "string" && SKIP_MUTATION_KEYS.has(first);
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      // Skip mutations that cannot affect lookup data.
      if (shouldSkip(mutation.options.mutationKey as readonly unknown[] | undefined)) {
        return;
      }

      // Invalidate every lookup query and immediately refetch any that are
      // currently mounted on screen.
      for (const prefix of LOOKUP_QUERY_PREFIXES) {
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === "string" && key.startsWith(prefix);
          },
          refetchType: "all",
        });
      }
    },
  }),

  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
