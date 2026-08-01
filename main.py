import logging
import os
import random
import re
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Literal

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from pydantic import BaseModel, ConfigDict, Field

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("weebokage")

PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "weebokage-296c0")
ADMIN_UID = os.getenv("ADMIN_UID", "")
CHAT_TTL = 3600
MAX_SESSIONS = 500

app = FastAPI(title="Weebokage API", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://weebokage.com",
        "https://weebokageofficial.github.io",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
security = HTTPBearer(auto_error=False)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self)"
    return response


MIKU_PROMPT = """You are MIKU SYSTEM 01, a Vocaloid-themed AI guide.
Address only a verified owner as Master; otherwise use User or Visitor.
Use the available tools when relevant. Reply in concise English."""

TETO_PROMPT = """You are TETO SYSTEM 04, a cheeky but respectful Vocaloid-themed AI guide.
Address only a verified owner as Master; otherwise use User or Visitor.
Use the available tools when relevant. Reply in concise English."""


def clean_text(value):
    text = re.sub(r"<function.*?>.*?</function>", "", str(value or ""), flags=re.DOTALL)
    return re.sub(r"\s+", " ", text.replace(chr(96), "'")).strip()


def get_json(url, params=None, timeout=10):
    response = requests.get(url, params=params, timeout=timeout)
    response.raise_for_status()
    return response.json()


@tool
def get_verified_hadith(topic: str = "", number: str = ""):
    """Search the Sahih al-Bukhari archive."""
    key = os.getenv("HADITH_API_KEY")
    if not key:
        return "HADITH_SERVICE_NOT_CONFIGURED"
    params = {"apiKey": key, "book": "sahih-bukhari", "paginate": 20}
    if number:
        params["hadithNumber"] = number[:20]
    elif topic:
        params["term"] = topic[:100]
    else:
        params["page"] = random.randint(1, 100)
    try:
        entries = get_json("https://hadithapi.com/api/hadiths", params).get("hadiths", {}).get("data", [])
        if not entries:
            return "HADITH_NOT_FOUND"
        entry = random.choice(entries)
        return "HADITH [{}]: {}".format(entry.get("hadithNumber", "N/A"), clean_text(entry.get("hadithEnglish")))
    except requests.RequestException:
        logger.exception("Hadith request failed")
        return "HADITH_SERVICE_UNAVAILABLE"


@tool
def get_anime_info(search_query: str = ""):
    """Search anime information through Jikan."""
    url = "https://api.jikan.moe/v4/anime" if search_query else "https://api.jikan.moe/v4/top/anime"
    params = {"limit": 5}
    if search_query:
        params["q"] = search_query[:100]
    try:
        entries = get_json(url, params).get("data", [])
        if not entries:
            return "ANIME_NOT_FOUND"
        anime = entries[0]
        return "ANIME '{}'. Score: {}. Summary: {}".format(
            anime.get("title", "Untitled"),
            anime.get("score", "N/A"),
            clean_text(anime.get("synopsis"))[:300],
        )
    except requests.RequestException:
        logger.exception("Anime request failed")
        return "ANIME_SERVICE_UNAVAILABLE"


@tool
def get_weather_report(city: str):
    """Fetch current weather for Burscheid or Köln."""
    locations = {
        "burscheid": (51.08, 7.11),
        "köln": (50.93, 6.95),
        "koln": (50.93, 6.95),
        "cologne": (50.93, 6.95),
    }
    location = locations.get(city.strip().lower())
    if not location:
        return "LOCATION_OUTSIDE_MONITORING_RANGE"
    try:
        data = get_json("https://api.open-meteo.com/v1/forecast", {
            "latitude": location[0],
            "longitude": location[1],
            "current_weather": "true",
        }, timeout=5)
        return "WEATHER for {}: {}°C.".format(city, data["current_weather"]["temperature"])
    except (requests.RequestException, KeyError):
        logger.exception("Weather request failed")
        return "WEATHER_SERVICE_UNAVAILABLE"


TOOLS = [get_verified_hadith, get_anime_info, get_weather_report]
TOOLS_MAP = {entry.name: entry for entry in TOOLS}
model_lock = Lock()
base_model = None
tool_model = None


def language_models():
    global base_model, tool_model
    if base_model and tool_model:
        return base_model, tool_model
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Chat is not configured.")
    with model_lock:
        if not base_model:
            base_model = ChatGroq(
                model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
                groq_api_key=key,
                temperature=0.7,
            )
            tool_model = base_model.bind_tools(TOOLS)
    return base_model, tool_model


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1000)
    theme: Literal["miku", "teto"] = "miku"
    session_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9-]+$")


class ChatState:
    def __init__(self):
        self.messages = []
        self.last_access = time.monotonic()
        self.lock = Lock()


chat_sessions = {}
sessions_lock = Lock()
rate_windows = defaultdict(deque)
rate_lock = Lock()


def enforce_rate_limit(request, limit, window_seconds=60):
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with rate_lock:
        window = rate_windows[key]
        while window and now - window[0] > window_seconds:
            window.popleft()
        if len(window) >= limit:
            raise HTTPException(status_code=429, detail="Too many requests.")
        window.append(now)


def get_chat_state(session_id):
    now = time.monotonic()
    with sessions_lock:
        expired = [key for key, state in chat_sessions.items() if now - state.last_access > CHAT_TTL]
        for key in expired:
            chat_sessions.pop(key, None)
        if len(chat_sessions) >= MAX_SESSIONS and session_id not in chat_sessions:
            oldest = min(chat_sessions, key=lambda key: chat_sessions[key].last_access)
            chat_sessions.pop(oldest, None)
        state = chat_sessions.setdefault(session_id, ChatState())
        state.last_access = now
        return state


def decode_token(credentials):
    if not credentials or credentials.scheme.lower() != "bearer":
        return None
    try:
        token = google_id_token.verify_firebase_token(credentials.credentials, GoogleAuthRequest(), audience=PROJECT_ID)
        token["uid"] = token.get("sub")
        return token
    except Exception:
        return None


def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    if not ADMIN_UID:
        raise HTTPException(status_code=503, detail="Admin verification is not configured.")
    token = decode_token(credentials)
    if not token:
        raise HTTPException(status_code=401, detail="Valid authentication required.")
    if token.get("uid") != ADMIN_UID:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return token


@app.get("/health")
def health():
    return {
        "status": "ok",
        "chat_configured": bool(os.getenv("GROQ_API_KEY")),
        "admin_verification_configured": bool(ADMIN_UID),
    }


@app.post("/chat")
def chat(
    payload: ChatRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    enforce_rate_limit(request, 20)
    plain_model, model_with_tools = language_models()
    token = decode_token(credentials)
    is_admin = bool(token and ADMIN_UID and token.get("uid") == ADMIN_UID)
    identity = "VERIFIED OWNER" if is_admin else "UNVERIFIED VISITOR"
    prompt = (TETO_PROMPT if payload.theme == "teto" else MIKU_PROMPT) + "\nSECURITY STATUS: " + identity
    state = get_chat_state(payload.session_id)

    with state.lock:
        if state.messages and state.messages[0].content != prompt:
            state.messages = []
        if not state.messages:
            state.messages.append(SystemMessage(content=prompt))
        state.messages.append(HumanMessage(content=payload.message.strip()))
        try:
            response = model_with_tools.invoke(state.messages)
            if response.tool_calls:
                state.messages.append(response)
                for call in response.tool_calls:
                    selected = TOOLS_MAP.get(call["name"])
                    result = selected.invoke(call["args"]) if selected else "TOOL_NOT_AVAILABLE"
                    state.messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))
                response = plain_model.invoke(state.messages)
            reply = clean_text(response.content)
            state.messages.append(AIMessage(content=reply))
            state.messages = [state.messages[0]] + state.messages[-11:]
            return {"reply": reply}
        except Exception as error:
            logger.exception("Chat failed")
            raise HTTPException(status_code=502, detail="Chat service unavailable.") from error


@app.get("/anime-proxy")
def anime_proxy(request: Request, search: str | None = Query(default=None, max_length=100)):
    enforce_rate_limit(request, 60)
    url = "https://api.jikan.moe/v4/anime" if search else "https://api.jikan.moe/v4/top/anime"
    params = {"limit": 12}
    if search:
        params["q"] = search.strip()
    try:
        return get_json(url, params).get("data", [])
    except requests.RequestException as error:
        logger.exception("Anime proxy failed")
        raise HTTPException(status_code=502, detail="Anime service unavailable.") from error


@app.get("/anime-detail/{mal_id}")
def anime_detail(mal_id: int, request: Request):
    enforce_rate_limit(request, 60)
    if mal_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid anime id.")
    try:
        info = get_json("https://api.jikan.moe/v4/anime/{}/full".format(mal_id)).get("data", {})
        characters = get_json("https://api.jikan.moe/v4/anime/{}/characters".format(mal_id)).get("data", [])
        return {"info": info, "characters": characters[:10]}
    except requests.RequestException as error:
        logger.exception("Anime detail failed")
        raise HTTPException(status_code=502, detail="Anime service unavailable.") from error


@app.get("/hadith/random")
def random_hadith(request: Request, _admin=Depends(require_admin)):
    enforce_rate_limit(request, 30)
    key = os.getenv("HADITH_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Hadith service is not configured.")
    try:
        data = get_json("https://hadithapi.com/api/hadiths", {
            "apiKey": key,
            "book": "sahih-bukhari",
            "paginate": 10,
            "page": random.randint(1, 100),
        })
        entries = data.get("hadiths", {}).get("data", [])
        if not entries:
            raise HTTPException(status_code=404, detail="No hadith found.")
        entry = random.choice(entries)
        return {
            "arabic": str(entry.get("hadithArabic", ""))[:10000],
            "english": str(entry.get("hadithEnglish", ""))[:10000],
            "number": str(entry.get("hadithNumber", "N/A"))[:30],
        }
    except HTTPException:
        raise
    except requests.RequestException as error:
        logger.exception("Hadith endpoint failed")
        raise HTTPException(status_code=502, detail="Hadith service unavailable.") from error


from private_routes import router as private_router

app.include_router(private_router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "10000")))
