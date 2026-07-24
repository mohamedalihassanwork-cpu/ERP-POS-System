"use strict";

/**
 * activation/ActivationPage.js — Activation Window HTML Generator
 *
 * Generates a self-contained, production-quality HTML page for the
 * software activation window.
 *
 * Features:
 *   - Displays the device fingerprint (Device ID) for the user to share
 *   - "Copy to Clipboard" button
 *   - License key textarea
 *   - "Activate" button
 *   - Bilingual UI (Arabic + English)
 *   - Premium dark-mode design
 *   - Communicates with main process via electron.ipcRenderer
 *
 * The generated HTML is completely self-contained (no external CDN, no fonts
 * loaded from the network). Works 100% offline.
 */

/**
 * Build the HTML string for the activation window.
 *
 * @param {string} fingerprint  64-character device fingerprint hex string
 * @returns {string}            Full HTML document as a string
 */
function buildReactivationPageHtml(fingerprint) {
  // Split fingerprint into readable groups of 8 for display
  const displayId = fingerprint
    .match(/.{1,8}/g)
    .join("-")
    .toUpperCase();

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تفعيل البرنامج — Software Activation</title>
  <style>
    /* ── Reset ─────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Root Variables ─────────────────────────────────────────────── */
    :root {
      --bg-deep:       #080c14;
      --bg-card:       #0f1728;
      --bg-input:      #0a1020;
      --border:        #1e2d4a;
      --border-focus:  #3b82f6;
      --accent:        #3b82f6;
      --accent-hover:  #2563eb;
      --accent-glow:   rgba(59, 130, 246, 0.25);
      --gold:          #f59e0b;
      --gold-dim:      rgba(245, 158, 11, 0.15);
      --text-primary:  #e2e8f0;
      --text-secondary:#94a3b8;
      --text-muted:    #475569;
      --success:       #10b981;
      --success-bg:    rgba(16, 185, 129, 0.12);
      --error:         #ef4444;
      --error-bg:      rgba(239, 68, 68, 0.12);
      --radius:        12px;
      --radius-sm:     8px;
      --shadow:        0 25px 60px rgba(0,0,0,0.6);
    }

    html, body {
      width: 100%; height: 100%;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: var(--bg-deep);
      color: var(--text-primary);
      overflow-y: auto;
      overflow-x: hidden;
      user-select: none;
    }

    /* ── Background grid ────────────────────────────────────────────── */
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image:
        linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }

    /* ── Layout ─────────────────────────────────────────────────────── */
    .page {
      position: relative; z-index: 1;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh;
      padding: 24px;
      gap: 0;
    }

    /* ── Card ───────────────────────────────────────────────────────── */
    .card {
      width: 100%; max-width: 560px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 40px 44px;
      box-shadow: var(--shadow),
                  inset 0 1px 0 rgba(255,255,255,0.04);
    }

    /* ── Logo / Header ──────────────────────────────────────────────── */
    .header {
      text-align: center;
      margin-bottom: 36px;
    }

    .shield-icon {
      display: inline-flex;
      align-items: center; justify-content: center;
      width: 64px; height: 64px;
      border-radius: 16px;
      background: linear-gradient(135deg, #1e3a5f, #0f2040);
      border: 1px solid rgba(59,130,246,0.3);
      margin-bottom: 20px;
      box-shadow: 0 0 30px var(--accent-glow);
    }

    .shield-icon svg { width: 32px; height: 32px; }

    .header h1 {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.3px;
      margin-bottom: 6px;
    }

    .header p {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    /* ── Section Label ──────────────────────────────────────────────── */
    .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    /* ── Device ID Box ──────────────────────────────────────────────── */
    .device-id-section { margin-bottom: 28px; }

    .device-id-box {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px 16px;
    }

    .device-id-text {
      flex: 1;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 11px;
      color: var(--gold);
      letter-spacing: 1.5px;
      word-break: break-all;
      line-height: 1.7;
      direction: ltr;
      text-align: left;
    }

    .copy-btn {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(59,130,246,0.4);
      background: rgba(59,130,246,0.1);
      color: var(--accent);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .copy-btn:hover {
      background: rgba(59,130,246,0.2);
      border-color: var(--accent);
      transform: translateY(-1px);
    }

    .copy-btn:active { transform: translateY(0); }

    .copy-btn.copied {
      border-color: var(--success);
      background: var(--success-bg);
      color: var(--success);
    }

    /* ── License Input ──────────────────────────────────────────────── */
    .license-section { margin-bottom: 24px; }

    .license-textarea {
      width: 100%;
      height: 100px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 11.5px;
      line-height: 1.6;
      padding: 12px 14px;
      resize: none;
      direction: ltr;
      text-align: left;
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
    }

    .license-textarea::placeholder { color: var(--text-muted); }

    .license-textarea:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    /* ── Activate Button ────────────────────────────────────────────── */
    .activate-btn {
      width: 100%;
      padding: 14px;
      border-radius: var(--radius-sm);
      border: none;
      background: linear-gradient(135deg, var(--accent), #1d4ed8);
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.25s;
      box-shadow: 0 4px 20px var(--accent-glow);
      margin-bottom: 20px;
      letter-spacing: 0.2px;
    }

    .activate-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, var(--accent-hover), #1e40af);
      transform: translateY(-2px);
      box-shadow: 0 8px 30px var(--accent-glow);
    }

    .activate-btn:active:not(:disabled) { transform: translateY(0); }

    .activate-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Spinner */
    .activate-btn.loading::after {
      content: '';
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Status Banner ──────────────────────────────────────────────── */
    .status-banner {
      display: none;
      align-items: flex-start;
      gap: 10px;
      padding: 14px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      line-height: 1.5;
      margin-top: 4px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .status-banner.show { display: flex; }

    .status-banner.success {
      background: var(--success-bg);
      border: 1px solid rgba(16,185,129,0.25);
      color: var(--success);
    }

    .status-banner.error {
      background: var(--error-bg);
      border: 1px solid rgba(239,68,68,0.25);
      color: var(--error);
    }

    .status-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

    /* ── Footer ─────────────────────────────────────────────────────── */
    .footer {
      text-align: center;
      margin-top: 28px;
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ── Divider ────────────────────────────────────────────────────── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="card">

      <!-- Header -->
      <div class="header">
        <div class="shield-icon" style="background: linear-gradient(135deg, #4c1d95, #312e81); border-color: rgba(139, 92, 246, 0.3); box-shadow: 0 0 30px rgba(139, 92, 246, 0.25);">
          <svg viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h1>إعادة تفعيل البرنامج</h1>
        <p style="color: var(--error); font-weight: 600;">The external HDD has changed.<br/>This software needs to be reactivated.</p>
      </div>

      <!-- Device ID -->
      <div class="device-id-section">
        <div class="label">معرّف الجهاز الجديد — New Device ID</div>
        <div class="device-id-box">
          <span class="device-id-text" id="deviceIdText">${displayId}</span>
          <button class="copy-btn" id="copyBtn" onclick="copyDeviceId()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            نسخ
          </button>
        </div>
      </div>

      <!-- Close Button -->
      <button class="activate-btn" style="background: linear-gradient(135deg, #475569, #334155); box-shadow: none;" onclick="window.close()">
        إغلاق — Close
      </button>

      <!-- Footer -->
      <div class="footer">
        نظام نقاط البيع &mdash; ERP &bull; جميع الحقوق محفوظة
      </div>

    </div>
  </div>

  <script>
    // The raw 64-char fingerprint (used for IPC, not displayed)
    const RAW_FINGERPRINT = "${fingerprint}";

    // ── Copy Device ID ───────────────────────────────────────────────────
    function copyDeviceId() {
      const btn = document.getElementById('copyBtn');
      navigator.clipboard.writeText(RAW_FINGERPRINT).then(() => {
        btn.textContent = '✓ تم النسخ';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = \`<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg> نسخ\`;
          btn.classList.remove('copied');
        }, 2500);
      }).catch(() => {
        // Fallback for environments without clipboard API
        const el = document.createElement('textarea');
        el.value = RAW_FINGERPRINT;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        btn.textContent = '✓ تم النسخ';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = \`<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg> نسخ\`;
          btn.classList.remove('copied');
        }, 2500);
      });
    }
  </script>
</body>
</html>`;
}

module.exports = { buildReactivationPageHtml };

