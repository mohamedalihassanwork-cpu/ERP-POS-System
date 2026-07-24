"use strict";

/**
 * SessionManager — Electron Session Isolation
 *
 * Each ERP window gets its own `persist:erp-window-{uuid}` Electron session
 * partition, providing complete isolation of:
 *   - Cookies (including HTTP-only JWT refresh tokens)
 *   - LocalStorage / IndexedDB / Cache
 *   - Service Workers
 *
 * Logging out from one window never affects another.
 */

const { session } = require("electron");
const { v4: uuidv4 } = require("crypto");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique partition name for a new window.
 * @returns {string}  e.g. "persist:erp-window-550e8400-e29b-41d4-a716-446655440000"
 */
function createPartitionName() {
  // Use crypto.randomUUID() when available (Node 14.17+), else fallback to
  // a simple hex string derived from random bytes.
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : require("crypto").randomBytes(16).toString("hex");
  return `persist:erp-window-${id}`;
}

// ---------------------------------------------------------------------------
// SessionManager class
// ---------------------------------------------------------------------------

class SessionManager {
  constructor() {
    /** @type {Map<string, string>}  windowId → partition */
    this._partitions = new Map();
  }

  /**
   * Create a brand-new persistent partition name for a new window.
   * The partition is not yet registered until `registerPartition` is called.
   *
   * @returns {string}  partition string
   */
  createPartition() {
    return createPartitionName();
  }

  /**
   * Register the windowId → partition mapping so it can be looked up later.
   *
   * @param {string} windowId
   * @param {string} partition
   */
  registerPartition(windowId, partition) {
    this._partitions.set(windowId, partition);
  }

  /**
   * Return the partition for an existing window ID, or create a new one if
   * the window has never been seen (first launch).
   *
   * @param {string|null} windowId
   * @returns {string}
   */
  getOrCreatePartition(windowId) {
    if (windowId && this._partitions.has(windowId)) {
      return this._partitions.get(windowId);
    }
    return createPartitionName();
  }

  /**
   * Remove the windowId → partition mapping when a window is closed.
   * The session data itself is NOT deleted — it persists on disk so the
   * window can be restored with the same login state.
   *
   * @param {string} windowId
   */
  unregisterPartition(windowId) {
    this._partitions.delete(windowId);
  }

  /**
   * Completely clear all stored data for a single session partition
   * (cookies, localStorage, IndexedDB, cache, etc.).
   *
   * Used when the user explicitly logs out AND wants to clear session data,
   * or when an old restored window's session should be wiped.
   *
   * @param {string} partition
   * @returns {Promise<void>}
   */
  async clearSession(partition) {
    try {
      const sess = session.fromPartition(partition);
      await sess.clearStorageData();
      await sess.clearCache();
    } catch (err) {
      console.warn(`[SessionManager] Failed to clear session for ${partition}:`, err.message);
    }
  }

  /**
   * Destroy the in-memory mapping and optionally clear all known sessions.
   * Called on app quit.
   *
   * @param {boolean} [clearStorage=false]
   */
  async destroy(clearStorage = false) {
    if (clearStorage) {
      const partitions = [...this._partitions.values()];
      await Promise.allSettled(partitions.map((p) => this.clearSession(p)));
    }
    this._partitions.clear();
  }

  /**
   * Return all registered partitions (for persistence).
   * @returns {Map<string, string>}
   */
  getPartitions() {
    return new Map(this._partitions);
  }
}

module.exports = { SessionManager };
