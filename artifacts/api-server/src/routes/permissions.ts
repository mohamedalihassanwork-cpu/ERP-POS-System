import { Router, type IRouter } from "express";
import { PERMISSION_GROUPS } from "@workspace/shared";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

// GET /permissions — static catalog grouped by module, used by the role editor.
router.get("/permissions", requireAuth, requirePermission("roles.view"), (_req, res) => {
  res.json(
    PERMISSION_GROUPS.map((group) => ({
      module: group.module,
      labelAr: group.labelAr,
      permissions: group.permissions.map((p) => ({
        key: p.key,
        labelAr: p.labelAr,
      })),
    })),
  );
});

export default router;
