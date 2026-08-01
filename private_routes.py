import os
from urllib.parse import urlparse

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


router = APIRouter(prefix="/admin", tags=["admin"])
security = HTTPBearer(auto_error=False)


def verified_admin(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    admin_uid = os.getenv("ADMIN_UID", "")
    if not admin_uid:
        raise HTTPException(status_code=503, detail="Admin verification is not configured.")
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Valid authentication required.")
    try:
        token = google_id_token.verify_firebase_token(credentials.credentials, GoogleAuthRequest(), audience=os.getenv("FIREBASE_PROJECT_ID", "weebokage-296c0"))
        token["uid"] = token.get("sub")
    except Exception as error:
        raise HTTPException(status_code=401, detail="Valid authentication required.") from error
    if token.get("uid") != admin_uid:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return token


def https_url(variable):
    value = os.getenv(variable, "").strip()
    parsed = urlparse(value)
    return value if parsed.scheme == "https" and parsed.netloc else ""


@router.get("/config")
def private_config(_admin=Depends(verified_admin)):
    drives = [
        {"title": "Google Drive Project A", "label": "OPEN DRIVE", "url": https_url("DRIVE_PROJECT_A_URL")},
        {"title": "Miku Background Pack", "label": "DOWNLOAD", "url": https_url("DRIVE_BACKGROUND_PACK_URL")},
    ]
    transit = [
        {"name": "Nagelsbaum", "url": https_url("TRANSIT_NAGELSBAUM_URL")},
        {"name": "Opladen", "url": https_url("TRANSIT_OPLADEN_URL")},
        {"name": "Leverkusen Mitte", "url": https_url("TRANSIT_LEVERKUSEN_URL")},
        {"name": "Köln-Merheim", "url": https_url("TRANSIT_MERHEIM_URL")},
    ]
    return {
        "drives": [entry for entry in drives if entry["url"]],
        "transit": [entry for entry in transit if entry["url"]],
    }
