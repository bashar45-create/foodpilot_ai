from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.main import app


def main() -> int:
    settings = get_settings()
    openapi_schema = app.openapi()
    route_paths = sorted({route.path for route in app.routes if hasattr(route, "path")})

    required_paths = ["/api/v1/health", "/api/v1/auth/login", "/api/v1/auth/register"]
    missing_paths = [path for path in required_paths if path not in route_paths]

    print("Workload check: OK")
    print(f"App name: {settings.app_name}")
    print(f"Route count: {len(route_paths)}")
    print(f"OpenAPI paths: {len(openapi_schema.get('paths', {}))}")
    print(f"Health route present: {'/api/v1/health' in route_paths}")

    if missing_paths:
        print(f"Missing critical routes: {', '.join(missing_paths)}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
