# Configure Twilio
TWILIO_ACCOUNT_SID = ""
TWILIO_AUTH_TOKEN = ""
TWILIO_FROM_NUMBER = ""

URL_BASE = "https://diskcactus.com/swirl/"

FILESYSTEM_BASE = "/home2/slowerin/www/diskcactus/swirl"


SESSION_SECRET_KEY = ""

# List of cookies that will be set by the app and their associated default values
# These will be configured per-device or per-event for customization and synchronization
COOKIES = {
    "cluster": -1,    # Group allows multiple screen groups at the same event. Each group produces one gif sequence per shoot.
    "screen": -1,   # Index of this screen in the group
    "event": "dev", # Unique name of the event. Not displayed to users.
    "logo": "/swirl/static/logo-bug.png",
    "title": "DOUBLE // FACE", # As displayed on screen
    "bgcolor": "#F3C700",
    "fgcolor": "#ffffff"
}
