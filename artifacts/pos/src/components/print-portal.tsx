import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function PrintPortal({ children, pageStyle }: { children: React.ReactNode, pageStyle?: string }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let el = document.getElementById("print-portal");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-portal";
      // Off-screen: content is rendered for Electron's hidden print window, not shown to the user.
      el.style.cssText =
        "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;";
      document.body.appendChild(el);
    }
    setContainer(el);

    return () => {};
  }, []);

  if (!container) return null;

  return createPortal(
    <>
      {pageStyle && <style>{`@page { ${pageStyle} }`}</style>}
      {children}
    </>,
    container
  );
}
