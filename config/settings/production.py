from .base import *

DEBUG = False

ALLOWED_HOSTS = [config('ALLOWED_HOSTS', default='')]


SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True