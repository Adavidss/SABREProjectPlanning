from urllib.parse import urlsplit

def safe_url(value):
    if not isinstance(value,str) or any(ord(c)<33 for c in value):return False
    try:
        u=urlsplit(value)
        return u.scheme in {'http','https'} and bool(u.hostname) and not u.username and not u.password
    except ValueError:return False

